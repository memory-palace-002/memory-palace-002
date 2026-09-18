interface Props {
  value: number
  onChange: (v: number) => void
  onCommit: (v: number) => void
}

export function ScaleSlider({ value, onChange, onCommit }: Props) {
  return (
    <div style={{ position: "absolute", right: 16, bottom: 96, zIndex: 10, background: "#fff8ef", padding: 12, borderRadius: 12 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>缩放 {value.toFixed(2)}x</div>
      <input
        type="range"
        min={0.3}
        max={3}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  )
}
