import { useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { SceneCanvas } from "../three/scene/SceneCanvas"
import { CabinetModel } from "../three/cabinet/CabinetModel"
import { DraggableItem } from "./DraggableItem"
import { ScaleSlider } from "./ScaleSlider"
import { RotateDial } from "./RotateDial"
import { PlaceActionDock } from "./PlaceActionDock"
import { MOCK_CABINET, PLANE_HEIGHT } from "../cabinet-view/mockData"
import type { Transform } from "@memory-palace/shared"
import { useThrottledPatch } from "../three/interaction/useThrottledPatch"

export function PlaceEditScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [sp] = useSearchParams()
  const itemId = sp.get("item")!

  const original = useMemo(() => MOCK_CABINET.items.find((i) => i.id === itemId)!, [itemId])
  const [transform, setTransform] = useState<Transform>(original.transform)

  const { schedule, flush } = useThrottledPatch<Transform>((t) => {
    console.log("[I2] PATCH /items/%s", itemId, t)
  })

  const onChange = (t: Transform) => {
    setTransform(t)
    schedule(t)
  }
  const onCommit = (t: Transform) => {
    setTransform(t)
    flush()
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <SceneCanvas disableOrbit>
        <CabinetModel url={MOCK_CABINET.cabinet.model.url!} />
        <DraggableItem
          item={original}
          transform={transform}
          planeHeight={PLANE_HEIGHT}
          onChange={onChange}
          onCommit={onCommit}
        />
      </SceneCanvas>

      <button onClick={() => navigate(-1)} style={{ position: "absolute", top: 16, left: 16, zIndex: 10 }}>
        ← 返回
      </button>

      <ScaleSlider
        value={transform.scale}
        onChange={(s) => onChange({ ...transform, scale: s })}
        onCommit={(s) => onCommit({ ...transform, scale: s })}
      />
      <RotateDial
        value={transform.rotation[1]}
        onChange={(r) => onChange({ ...transform, rotation: [0, r, 0] })}
        onCommit={(r) => onCommit({ ...transform, rotation: [0, r, 0] })}
      />
      <PlaceActionDock
        onDone={() => {
          flush()
          navigate("/cabinets/" + id + "/view")
        }}
        onReset={() => {
          setTransform(original.transform)
          onCommit(original.transform)
        }}
        onDelete={() => {
          navigate("/cabinets/" + id + "/view")
        }}
      />
    </div>
  )
}
