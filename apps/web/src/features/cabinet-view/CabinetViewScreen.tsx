import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { SceneCanvas } from "../three/scene/SceneCanvas"
import { CabinetModel } from "../three/cabinet/CabinetModel"
import { ItemModel } from "../three/item/ItemModel"
import { HoverBlurbPopover } from "./HoverBlurbPopover"
import { ItemBlurbDrawer } from "./ItemBlurbDrawer"
import { MOCK_CABINET } from "./mockData"
import type { CabinetItemVO } from "@memory-palace/shared"
import { usePickInteraction } from "../three/interaction/usePickInteraction"
import { useIsMobile } from "../../hooks/useIsMobile"

export function CabinetViewScreen() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const data = MOCK_CABINET

  const [active, setActive] = useState<CabinetItemVO | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)

  const { recordDown, isTap } = usePickInteraction()

  const hovered = data.items.find((i) => i.id === hoveredId)

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100vh" }}
      onPointerDown={(e) => recordDown(e.clientX, e.clientY)}
    >
      <SceneCanvas>
        <CabinetModel url={data.cabinet.model.url!} />
        {data.items.map((item) => (
          <ItemModel
            key={item.id}
            item={item}
            highlighted={hoveredId === item.id}
            onPointerOver={(e) => {
              if (isMobile) return
              e.stopPropagation()
              setHoveredId(item.id)
              setHoverPos({ x: e.clientX, y: e.clientY })
            }}
            onPointerOut={() => {
              if (isMobile) return
              setHoveredId(null)
              setHoverPos(null)
            }}
            onClick={(e) => {
              if (isMobile && !isTap(e.clientX, e.clientY)) return
              e.stopPropagation()
              setActive(item)
            }}
          />
        ))}
      </SceneCanvas>

      <button onClick={() => navigate(-1)} style={{ position: "absolute", top: 16, left: 16, zIndex: 10 }}>
        ← 返回
      </button>

      {!isMobile && hovered?.blurb && hoverPos && (
        <HoverBlurbPopover content={hovered.blurb.content} x={hoverPos.x} y={hoverPos.y} />
      )}

      <ItemBlurbDrawer item={active} onClose={() => setActive(null)} />

      <button
        onClick={() => navigate("/cabinets/" + data.cabinet.id + "/place?item=" + data.items[0].id)}
        style={{ position: "absolute", bottom: 24, right: 24, zIndex: 10 }}
      >
        编辑摆放
      </button>
    </div>
  )
}
