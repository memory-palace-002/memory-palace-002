interface Props {
  onDone: () => void
  onReset: () => void
  onDelete: () => void
}

export function PlaceActionDock({ onDone, onReset, onDelete }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 12,
        zIndex: 10,
      }}
    >
      <button onClick={onReset}>重置</button>
      <button onClick={onDone}>完成</button>
      <button
        onClick={() => {
          if (window.confirm("删除后 15 天内可恢复，确认删除？")) onDelete()
        }}
        style={{ color: "#b23" }}
      >
        删除
      </button>
    </div>
  )
}
