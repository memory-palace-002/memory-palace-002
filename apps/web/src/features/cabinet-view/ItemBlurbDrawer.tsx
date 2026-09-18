import type { CabinetItemVO } from "@memory-palace/shared"
import { useIsMobile } from "../../hooks/useIsMobile"

interface Props {
  item: CabinetItemVO | null
  onClose: () => void
}

export function ItemBlurbDrawer({ item, onClose }: Props) {
  const isMobile = useIsMobile()
  if (!item) return null

  const panel = (
    <div style={{ background: "#fff8ef", borderRadius: isMobile ? "16px 16px 0 0" : 16, padding: 20, maxWidth: isMobile ? "100%" : 480, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>{item.name}</h3>
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer" }}>关闭</button>
      </div>
      <div style={{ marginTop: 12, lineHeight: 1.7, fontFamily: "LXGW WenKai, serif" }}>
        {item.blurb?.content ?? "（还没有简介）"}
      </div>
      {item.blurb && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#8a7a63" }}>
          {item.blurb.source} · {new Date(item.blurb.updated_at).toLocaleString()}
        </div>
      )}
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", display: "flex", justifyContent: "center" }}>{panel}</div>
    </div>
  )
}
