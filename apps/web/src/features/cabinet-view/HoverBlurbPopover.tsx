interface Props {
  content: string
  x: number
  y: number
}

export function HoverBlurbPopover({ content, x, y }: Props) {
  const preview = content.slice(0, 50) + (content.length > 50 ? '…' : '')
  return (
    <div
      style={{
        position: 'fixed',
        left: x + 12,
        top: y + 12,
        maxWidth: 240,
        padding: '8px 12px',
        background: '#fff8ef',
        border: '1px solid #e6d9c6',
        borderRadius: 10,
        boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
        fontSize: 13,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {preview}
    </div>
  )
}