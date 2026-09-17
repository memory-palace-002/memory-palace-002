/**
 * DrawerFolder —— 抽屉里弹出的「文件夹」弹窗
 *
 * 两种状态：
 *   ① 闭合：桌面上躺着一个文件夹（带标签页的造型），点击它 → onOpen
 *   ② 打开：展开成内容面板，里面现在是占位内容（用户要求先占位，后续再填真实内容）
 *
 * 只负责这个弹窗本身的造型与开关，抽屉的 3D 拉出和镜头推进在 Room25D / RoomBackground。
 */
import { useState, type CSSProperties } from 'react'

const AMBER = '#d9a55f'
const AMBER_DARK = '#c08c46'
const PAPER = '#fdf6e8'

/* 文件夹本体（闭合态）：标签页 + 圆角矩形 */
const FOLDER_STYLE: CSSProperties = {
  position: 'relative',
  width: 260,
  height: 172,
  cursor: 'pointer',
  filter: 'drop-shadow(0 18px 26px rgba(40, 28, 16, 0.45))',
  transition: 'transform .18s ease, filter .18s ease',
  animation: 'mr3d-folder-in .45s cubic-bezier(.2,.9,.3,1) both',
}

const TAB_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: -22,
  width: 108,
  height: 24,
  background: AMBER_DARK,
  borderRadius: '10px 10px 0 0',
}

const BODY_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: `linear-gradient(160deg, ${AMBER} 0%, ${AMBER_DARK} 100%)`,
  borderRadius: '8px 12px 12px 12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  color: '#4a3418',
}

/* 打开后的内容面板 */
const PANEL_STYLE: CSSProperties = {
  width: 460,
  maxWidth: '86vw',
  background: PAPER,
  borderRadius: 14,
  boxShadow: '0 24px 48px rgba(40, 28, 16, 0.5)',
  overflow: 'hidden',
  animation: 'mr3d-folder-open .32s cubic-bezier(.2,.9,.3,1) both',
}

const BAR_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  background: AMBER_DARK,
  color: '#4a3418',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: 1,
}

const CONTENT_STYLE: CSSProperties = {
  padding: '26px 20px 30px',
  minHeight: 190,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  color: '#7a6a52',
  fontSize: 14,
  textAlign: 'center',
  lineHeight: 1.9,
}

const BTN_STYLE: CSSProperties = {
  marginTop: 6,
  padding: '8px 22px',
  border: 'none',
  borderRadius: 999,
  background: '#6b563c',
  color: '#fdf6e8',
  fontSize: 13,
  letterSpacing: 1,
  cursor: 'pointer',
}

export default function DrawerFolder({
  opened,
  onOpen,
  onClose,
}: {
  opened: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const [hover, setHover] = useState(false)

  if (opened) {
    return (
      <div style={PANEL_STYLE}>
        <div style={BAR_STYLE}>
          <span>📁 抽屉里的回忆</span>
          <span style={{ fontSize: 12, opacity: 0.75 }}>占位</span>
        </div>
        <div style={CONTENT_STYLE}>
          <div style={{ fontSize: 34, opacity: 0.5 }}>🗂️</div>
          <div>这里以后放抽屉里的回忆内容</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>（结构已搭好，具体内容后续再填）</div>
          <button style={BTN_STYLE} onClick={onClose}>
            关上抽屉
          </button>
        </div>
        <style>{`@keyframes mr3d-folder-open { from { opacity: 0; transform: scale(.94) } to { opacity: 1; transform: scale(1) } }`}</style>
      </div>
    )
  }

  return (
    <div
      style={{ ...FOLDER_STYLE, transform: hover ? 'scale(1.05)' : 'scale(1)' }}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
      onClick={onOpen}
    >
      <div style={TAB_STYLE} />
      <div style={BODY_STYLE}>
        <div style={{ fontSize: 40 }}>📁</div>
        <div style={{ fontSize: 15, letterSpacing: 2 }}>点击打开</div>
      </div>
      <style>{`@keyframes mr3d-folder-in { from { opacity: 0; transform: translateY(18px) scale(.9) } to { opacity: 1; transform: translateY(0) scale(1) } }`}</style>
    </div>
  )
}
