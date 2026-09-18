/**
 * DrawerFolder —— 抽屉文件夹「手账」弹窗（三段式）
 *
 *  ① closed  闭合文件夹：ReactBits 风格悬停动效（整体上浮 -8px、封口 skew 张开、纸张探头）
 *            点击 → 进入扇形展开
 *  ② fan     三张纸呈扇形铺开：待办事项 / 今年·过去的成就 / 梦想，
 *            纸张带鼠标磁吸跟随（--mx/--my）与悬停放大；点击某张纸 → 进入对应手账页
 *  ③ page    手账页面：米色横线稿纸，双击空白处填写文字（空纸左上角提示「双击填写」）；
 *            纸的右边挂一个圆形「＋」悬浮按钮 → 添加图片 / 添加贴纸；
 *            贴上去的图片贴纸可拖动、悬停出 ✕ 删除；所有内容存 localStorage
 *
 * 配色沿用房间里的琥珀色文件夹（#d9a55f），所有类名加 jc- 前缀避免污染全局。
 * 三个阶段之间用 CSS transition 交叉淡入淡出，切换丝滑。
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ChangeEvent as ReactChangeEvent,
} from 'react'
import './DrawerFolder.css'

/* ---------- 数据模型 ---------- */
type PageId = 'todo' | 'achieve' | 'dream'
type JcItem =
  | { id: string; type: 'img'; src: string; x: number; y: number; rot: number; w: number }
  | { id: string; type: 'emoji'; char: string; x: number; y: number; rot: number; size: number }
type PageData = { text: string; items: JcItem[] }
type Store = Record<PageId, PageData>
type Stage = 'closed' | 'fan' | 'page'

const PAGES: { id: PageId; title: string; emoji: string }[] = [
  { id: 'todo', title: '待办事项', emoji: '📝' },
  { id: 'achieve', title: '今年 / 过去的成就', emoji: '🏆' },
  { id: 'dream', title: '梦想', emoji: '✨' },
]

const STORE_KEY = 'memory-room3d/drawer-pages-v1'
const emptyPage = (): PageData => ({ text: '', items: [] })

function loadStore(): Store {
  const fallback: Store = { todo: emptyPage(), achieve: emptyPage(), dream: emptyPage() }
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Store>
    ;(['todo', 'achieve', 'dream'] as PageId[]).forEach((k) => {
      const p = parsed[k]
      if (p && typeof p.text === 'string' && Array.isArray(p.items)) {
        fallback[k] = { text: p.text, items: p.items }
      }
    })
  } catch {
    /* 存档损坏就当作空白手账 */
  }
  return fallback
}

const STICKERS = [
  '⭐', '🌟', '✨', '🌈', '🍀', '🌻', '🌙', '☀️',
  '🎀', '🎉', '🎈', '🏆', '🎯', '📌', '📚', '☕',
  '🍰', '🐱', '🐶', '🐰', '🦊', '🐼', '🌸', '💪',
  '🔥', '🥳', '😎', '🫶', '💭', '💌', '🎵', '⏰',
]

const uid = () => `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/* ---------- 组件 ---------- */
export default function DrawerFolder({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('closed')
  const [pageId, setPageId] = useState<PageId>('todo')
  const [store, setStore] = useState<Store>(loadStore)
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [stickersOpen, setStickersOpen] = useState(false)
  /* 扇形纸张的鼠标磁吸偏移（三张纸各一份） */
  const [mags, setMags] = useState([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ])

  const bodyRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const page = store[pageId]
  const pageMeta = PAGES.find((p) => p.id === pageId)!

  /* 数据持久化：任何改动立即落盘 */
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store))
    } catch {
      /* 空间不足等异常忽略 */
    }
  }, [store])

  /* 切换阶段 / 切换纸张时，重置编辑与弹层 */
  useEffect(() => {
    setEditing(false)
    setMenuOpen(false)
    setStickersOpen(false)
  }, [stage, pageId])

  /* 进入编辑态自动聚焦光标 */
  useEffect(() => {
    if (editing) textRef.current?.focus()
  }, [editing])

  /* ---------- 扇形纸张：鼠标磁吸跟随 ---------- */
  const fanMove = (i: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stage !== 'fan') return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - (r.left + r.width / 2)) * 0.15
    const y = (e.clientY - (r.top + r.height / 2)) * 0.15
    setMags((m) => m.map((v, j) => (j === i ? { x, y } : v)))
  }
  const fanLeave = (i: number) => () => {
    setMags((m) => m.map((v, j) => (j === i ? { x: 0, y: 0 } : v)))
  }

  /* ---------- 手账页：添加贴纸 / 图片 ---------- */
  const addEmoji = (char: string) => {
    const r = bodyRef.current?.getBoundingClientRect()
    const it: JcItem = {
      id: uid(),
      type: 'emoji',
      char,
      x: r ? r.width / 2 + (Math.random() * 90 - 45) : 220,
      y: r ? r.height * 0.3 + Math.random() * 60 : 180,
      rot: Math.random() * 18 - 9,
      size: 38 + Math.round(Math.random() * 10),
    }
    setStore((s) => ({ ...s, [pageId]: { ...s[pageId], items: [...s[pageId].items, it] } }))
  }

  const onPickImage = (e: ReactChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        /* 压缩到长边 ≤ 720px 再存，避免 localStorage 爆掉 */
        const MAX = 720
        const k = Math.min(1, MAX / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.width * k))
        c.height = Math.max(1, Math.round(img.height * k))
        const ctx = c.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, c.width, c.height)
        const r = bodyRef.current?.getBoundingClientRect()
        const it: JcItem = {
          id: uid(),
          type: 'img',
          src: c.toDataURL('image/jpeg', 0.82),
          x: r ? r.width / 2 : 220,
          y: r ? r.height * 0.32 : 180,
          rot: Math.random() * 10 - 5,
          w: 128,
        }
        setStore((s) => ({ ...s, [pageId]: { ...s[pageId], items: [...s[pageId].items, it] } }))
        setMenuOpen(false)
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(f)
  }

  const removeItem = (id: string) => {
    setStore((s) => ({
      ...s,
      [pageId]: { ...s[pageId], items: s[pageId].items.filter((v) => v.id !== id) },
    }))
  }

  /* ---------- 渲染 ---------- */
  return (
    <div className="jc-root">
      {/* ===== 阶段①②：文件夹（闭合 / 扇形展开） ===== */}
      <div className={`jc-folder-wrap jc-grid ${stage === 'page' ? 'jc-hide' : ''}`}>
        <div
          className={`jc-folder ${stage === 'fan' ? 'jc-fan' : ''}`}
          role="button"
          tabIndex={0}
          aria-expanded={stage === 'fan'}
          onClick={() => setStage(stage === 'closed' ? 'fan' : 'closed')}
          onKeyDown={(e: ReactKeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setStage(stage === 'closed' ? 'fan' : 'closed')
            }
          }}
        >
          <div className="jc-folder__back">
            {PAGES.map((p, i) => (
              <div
                key={p.id}
                className={`jc-paper jc-paper-${i + 1}`}
                style={{ '--mx': `${mags[i].x}px`, '--my': `${mags[i].y}px` } as CSSProperties}
                onMouseMove={fanMove(i)}
                onMouseLeave={fanLeave(i)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (stage === 'fan') {
                    setPageId(p.id)
                    setStage('page')
                  }
                }}
              >
                <span className="jc-paper-emoji">{p.emoji}</span>
                <span className="jc-paper-title">{p.title}</span>
              </div>
            ))}
            <div className="jc-folder__front">
              <span className="jc-front-name">记忆手账</span>
              <span className="jc-front-sub">点击打开</span>
            </div>
            <div className="jc-folder__front jc-right" />
          </div>
        </div>
        <div className="jc-folder-caption">
          {stage === 'fan' ? '点击一张纸开始书写 ✍️' : ''}
        </div>
        <button className="jc-close-x" onClick={onClose} title="关上抽屉" aria-label="关上抽屉">
          ✕
        </button>
      </div>

      {/* ===== 阶段③：手账页面 ===== */}
      <div className={`jc-sheet-wrap jc-grid ${stage === 'page' ? '' : 'jc-hide'}`}>
        <div className="jc-sheet">
          <div className="jc-sheet-head">
            <button className="jc-back" onClick={() => setStage('fan')}>
              ← 返回
            </button>
            <span className="jc-sheet-title">
              {pageMeta.emoji} {pageMeta.title}
            </span>
            <button className="jc-close-x jc-close-head" onClick={onClose} title="关上抽屉" aria-label="关上抽屉">
              ✕
            </button>
          </div>

          {/* 稿纸区：双击填写文字；图片贴纸漂浮其上 */}
          <div
            ref={bodyRef}
            className="jc-body"
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('.jc-item')) return
              setEditing(true)
            }}
          >
            {editing ? (
              <textarea
                ref={textRef}
                className="jc-textarea"
                value={page.text}
                placeholder={'在这里写下……\n（点纸外任意处保存）'}
                onChange={(e) =>
                  setStore((s) => ({ ...s, [pageId]: { ...s[pageId], text: e.target.value } }))
                }
                onBlur={() => setEditing(false)}
              />
            ) : (
              <>
                <div className="jc-text">{page.text}</div>
                {!page.text && <div className="jc-empty-hint">双击填写</div>}
              </>
            )}

            {page.items.map((it) => (
              <div
                key={it.id}
                className={`jc-item ${it.type === 'img' ? 'jc-item-img' : 'jc-item-emoji'}`}
                style={{ left: it.x, top: it.y, transform: `translate(-50%, -50%) rotate(${it.rot}deg)` }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  const r = bodyRef.current!.getBoundingClientRect()
                  dragRef.current = {
                    id: it.id,
                    dx: e.clientX - (r.left + it.x),
                    dy: e.clientY - (r.top + it.y),
                  }
                }}
                onPointerMove={(e) => {
                  const d = dragRef.current
                  if (!d || d.id !== it.id) return
                  const r = bodyRef.current!.getBoundingClientRect()
                  const x = clamp(e.clientX - r.left - d.dx, 26, r.width - 26)
                  const y = clamp(e.clientY - r.top - d.dy, 26, r.height - 26)
                  setStore((s) => ({
                    ...s,
                    [pageId]: {
                      ...s[pageId],
                      items: s[pageId].items.map((v) => (v.id === it.id ? { ...v, x, y } : v)),
                    },
                  }))
                }}
                onPointerUp={() => {
                  dragRef.current = null
                }}
                onPointerCancel={() => {
                  dragRef.current = null
                }}
              >
                {it.type === 'img' ? (
                  <img src={it.src} alt="" draggable={false} style={{ width: it.w }} />
                ) : (
                  <span style={{ fontSize: it.size }}>{it.char}</span>
                )}
                <button className="jc-item-del" title="移除" onClick={() => removeItem(it.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* 纸右边的圆形「＋」悬浮按钮 + 弹层 */}
          <button
            className={`jc-add-btn ${menuOpen ? 'jc-add-open' : ''}`}
            title="添加图片 / 贴纸"
            onClick={() => {
              setMenuOpen((v) => !v)
              setStickersOpen(false)
            }}
          >
            ＋
          </button>
          <div className={`jc-add-menu ${menuOpen ? '' : 'jc-hide'}`}>
            <button onClick={() => fileRef.current?.click()}>🖼️ 添加图片</button>
            <button
              onClick={() => {
                setMenuOpen(false)
                setStickersOpen(true)
              }}
            >
              😀 添加贴纸
            </button>
          </div>
          <div className={`jc-stickers ${stickersOpen ? '' : 'jc-hide'}`}>
            {STICKERS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  addEmoji(c)
                  setStickersOpen(false)
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="jc-file" onChange={onPickImage} />
        </div>
      </div>
    </div>
  )
}
