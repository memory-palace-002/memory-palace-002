/**
 * PhotoWall —— 相框墙「照片墙」全屏滚动墙
 *
 * 从房间的相框墙点进来（RoomBackground 的 phase === 'wall'）：
 *   - 镜头推到相框墙正前方（CinematicRig 负责），画布整体虚化（WALL_BLUR_STYLE 负责）
 *   - 本组件负责前景这块全屏滚动照片墙：深色背景 + 瀑布流多列 + 滚动浏览，
 *     鼠标滑过时照片放大并变亮（参考用户提供的深色画廊截图）
 *   - 相框墙上会实时显示前 5 张（Room25D.jsx 的 WallFrames 按同一份数据贴图）
 *
 * 数据存 localStorage，压缩到长边 ≤ 900px（避免 base64 撑爆 5MB 配额）。
 * 类名统一 pw- 前缀，避免污染全局。
 */
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent as ReactChangeEvent } from 'react'
import './PhotoWall.css'

export type WallPhoto = { id: string; src: string }

const STORE_KEY = 'memory-room3d/photo-wall-v1'
const MAX_PHOTOS = 24
const MAX_EDGE = 900
const JPEG_QUALITY = 0.8
/** 相框墙上能挂的照片张数（与 Room25D.jsx 的 WALL_FRAMES 长度一致） */
export const FRAME_SLOTS = 5

const uid = () => `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** 供父级初始化用（房间里的相框要和这里读同一份数据） */
export function loadWallPhotos(): string[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((v) => (v && typeof (v as WallPhoto).src === 'string' ? (v as WallPhoto).src : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

/* 读入文件 → 压缩 → dataURL。失败返回 null（不打断其它图片） */
function readCompressed(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve(null)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => resolve(null)
      img.onload = () => {
        try {
          const k = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(img.width * k))
          c.height = Math.max(1, Math.round(img.height * k))
          const ctx = c.getContext('2d')
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0, c.width, c.height)
          resolve(c.toDataURL('image/jpeg', JPEG_QUALITY))
        } catch {
          resolve(null)
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export default function PhotoWall({
  onClose,
  onPhotosChange,
}: {
  onClose: () => void
  /** 照片列表变化时回调（父级拿去做 3D 相框贴图） */
  onPhotosChange?: (urls: string[]) => void
}) {
  const [photos, setPhotos] = useState<WallPhoto[]>(() =>
    loadWallPhotos().map((src) => ({ id: uid(), src }))
  )
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  /* 落盘 + 同步父级。存储写失败（配额）时给一行提示，不崩 */
  useEffect(() => {
    const urls = photos.map((p) => p.src)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(photos))
      setNote((n) => (n ? '' : n)) // 值没变时 React 会跳过重渲染
    } catch {
      setNote('存储空间不足，先删掉几张再加吧')
    }
    onPhotosChange?.(urls)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  /* Esc 返回房间 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onPick = (e: ReactChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 允许重复选同一个文件
    if (!files.length) return
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      setNote(`最多 ${MAX_PHOTOS} 张，先删掉一些吧`)
      return
    }
    if (files.length > room) setNote(`最多 ${MAX_PHOTOS} 张，超出的已忽略`)
    Promise.all(files.slice(0, room).map(readCompressed)).then((loaded) => {
      const add = loaded.filter((s): s is string => !!s).map((src) => ({ id: uid(), src }))
      if (add.length) setPhotos((cur) => [...cur, ...add])
      else setNote('这些文件读不出来，换几张试试')
    })
  }

  const removeAt = (id: string) => setPhotos((cur) => cur.filter((v) => v.id !== id))

  const move = (from: number, to: number) => {
    if (from === to) return
    setPhotos((cur) => {
      const next = cur.slice()
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
  }

  const resetDrag = () => {
    setDragIdx(null)
    setOverIdx(null)
  }

  return (
    <div className="pw-root">
      {/* 顶栏（固定在墙上不随内容滚动） */}
      <header className="pw-head">
        <div className="pw-title">
          我的照片墙
          <span className="pw-count">
            {photos.length} / {MAX_PHOTOS}
          </span>
        </div>
        <div className="pw-actions">
          <button className="pw-add" onClick={() => fileRef.current?.click()}>
            ＋ 添加图片
          </button>
          <button className="pw-close" onClick={onClose} title="返回房间（Esc）" aria-label="返回房间">
            ✕
          </button>
        </div>
      </header>

      {/* 滚动区：深色画廊 + 瀑布流 */}
      <div className="pw-scroll">
        {photos.length === 0 ? (
          <button className="pw-empty" onClick={() => fileRef.current?.click()}>
            <span className="pw-empty-ico">＋</span>
            <span className="pw-empty-t1">点击添加照片</span>
            <span className="pw-empty-t2">可以一次选多张，拖动能调整顺序</span>
          </button>
        ) : (
          <>
            <div className="pw-masonry">
              {photos.map((p, i) => (
                <figure
                  key={p.id}
                  className={[
                    'pw-cell',
                    dragIdx === i ? 'pw-cell-dragging' : '',
                    dragIdx !== null && overIdx === i && dragIdx !== i ? 'pw-cell-over' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragEnd={resetDrag}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (overIdx !== i) setOverIdx(i)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIdx !== null) move(dragIdx, i)
                    resetDrag()
                  }}
                  title="拖动可调整顺序"
                >
                  <img src={p.src} alt="" draggable={false} />
                  <figcaption className="pw-idx">{i + 1}</figcaption>
                  {i < FRAME_SLOTS && <span className="pw-onwall">挂墙</span>}
                  <button
                    className="pw-del"
                    title="移除这张"
                    aria-label="移除这张"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeAt(p.id)
                    }}
                  >
                    ✕
                  </button>
                </figure>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button className="pw-cell pw-cell-add" onClick={() => fileRef.current?.click()}>
                  <span className="pw-add-ico">＋</span>
                  <span className="pw-add-t">添加图片</span>
                </button>
              )}
            </div>
            <footer className="pw-foot">
              <span className="pw-tip">
                鼠标滑过放大变亮 · 拖动照片可调整顺序 · 前 {FRAME_SLOTS} 张会挂到相框墙上
              </span>
              {note && <span className="pw-note">{note}</span>}
            </footer>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="pw-file"
        onChange={onPick}
      />
    </div>
  )
}
