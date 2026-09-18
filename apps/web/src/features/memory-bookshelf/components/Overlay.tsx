import { useEffect, useRef, useState } from 'react'
import { demoCapture } from '../data/boxes'
import { useBookshelf } from '../store/bookshelf'

const PAGE_SIZE = 4

/**
 * 记忆书柜 DOM 交互层（移植自队友项目，类名加 bksh- 前缀避免与本仓库全局样式冲突）:
 * 关闭按钮、翻页器、重命名面板、物品详情、新建记忆入口。
 * 根层 pointer-events:none, 只有具体控件可点击, 不挡 3D 交互。
 */
export function Overlay() {
  const phase = useBookshelf((s) => s.phase)
  const activeId = useBookshelf((s) => s.activeId)
  const page = useBookshelf((s) => s.currentPage)
  const setPage = useBookshelf((s) => s.setPage)
  const closeBook = useBookshelf((s) => s.closeBook)
  const renamingId = useBookshelf((s) => s.renamingId)
  const detail = useBookshelf((s) => s.detail)
  const closeDetail = useBookshelf((s) => s.closeDetail)
  const returnItem = useBookshelf((s) => s.returnItem)
  const capture = useBookshelf((s) => s.capture)

  const storeBoxes = useBookshelf((s) => s.boxes)
  const shown = phase !== 'closed'

  const renameBox = storeBoxes.find((b) => b.id === renamingId)
  const openBox = storeBoxes.find((b) => b.id === activeId)
  const pages = openBox ? Math.max(1, Math.ceil(openBox.items.length / PAGE_SIZE)) : 1
  const detailItem = detail
    ? (storeBoxes.find((b) => b.id === detail.boxId)?.items.find((i) => i.id === detail.itemId) ?? null)
    : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (detail) return closeDetail()
        if (renamingId) return useBookshelf.setState({ renamingId: null })
        return closeBook()
      }
      if (e.key === 'ArrowRight' && phase === 'open' && pages > 1)
        setPage(Math.min(pages - 1, page + 1))
      if (e.key === 'ArrowLeft' && phase === 'open') setPage(Math.max(0, page - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeBook, closeDetail, detail, renamingId, phase, pages, page, setPage])

  return (
    <div className="bksh-overlay">
      {shown && (
        <>
          <button className="bksh-close-btn" aria-label="关闭" onClick={() => closeBook()}>
            ×
          </button>
          {openBox && pages > 1 && (
            <div className="bksh-pager">
              <button disabled={page <= 0} onClick={() => setPage(page - 1)} aria-label="上一页">
                ‹
              </button>
              <span>
                {page + 1} / {pages}
              </span>
              <button
                disabled={page >= pages - 1}
                onClick={() => setPage(page + 1)}
                aria-label="下一页"
              >
                ›
              </button>
            </div>
          )}
          <div className="bksh-hint">Esc 或右上角 × 关闭 · 点击书页翻页 · 拖动物品可取出</div>
        </>
      )}

      {/* 新建记忆: 外壳按钮, 数据走 ingestCapture 接口(队友模块接入后自动生效) */}
      <button className="bksh-capture-btn" onClick={() => capture(demoCapture())}>
        ＋ 新建记忆
      </button>

      {renameBox && <RenamePanel key={renameBox.id} initial={renameBox.title} />}

      {detailItem && (
        <div className="bksh-modal-backdrop" onClick={() => closeDetail()}>
          <div className="bksh-modal" onClick={(e) => e.stopPropagation()}>
            <button className="bksh-close-btn bksh-modal-close" aria-label="关闭" onClick={() => closeDetail()}>
              ×
            </button>
            {detailItem.src && <img src={detailItem.src} alt={detailItem.caption ?? ''} />}
            {detailItem.kind === 'voice' && (
              <div className="bksh-voice-preview">
                <span className="bksh-voice-play">▶</span>
                <strong>{detailItem.duration}</strong>
                <em>(播放由语音模块接入)</em>
              </div>
            )}
            {detailItem.kind === 'note' && <p className="bksh-note-body">{detailItem.text}</p>}
            <h2>{detailItem.caption ?? '记忆物件'}</h2>
            <div className="bksh-meta">
              {detailItem.text && detailItem.kind !== 'note' && <p>{detailItem.text}</p>}
              {detailItem.time && <p>时间:{detailItem.time}</p>}
              {detailItem.place && <p>地点:{detailItem.place}</p>}
              <p>
                类型:
                {detailItem.kind === 'photo'
                  ? '照片'
                  : detailItem.kind === 'object'
                    ? '2.5D 扫描物件'
                    : detailItem.kind === 'voice'
                      ? '语音'
                      : '文字'}
              </p>
            </div>
            {detailItem.extracted && (
              <div className="bksh-actions">
                <button className="bksh-primary" onClick={() => returnItem(detail!.boxId, detailItem.id)}>
                  放回书里
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RenamePanel({ initial }: { initial: string }) {
  const renameCommit = useBookshelf((s) => s.renameCommit)
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null!)
  useEffect(() => inputRef.current?.select(), [])
  return (
    <div className="bksh-rename-panel">
      <input
        ref={inputRef}
        value={value}
        maxLength={12}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') renameCommit(value)
        }}
      />
      <button className="bksh-primary" onClick={() => renameCommit(value)}>
        确定
      </button>
      <button onClick={() => useBookshelf.setState({ renamingId: null })}>取消</button>
    </div>
  )
}
