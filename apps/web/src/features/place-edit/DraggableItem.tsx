import { useRef } from "react"
import type { CabinetItemVO, Transform } from "@memory-palace/shared"
import { ItemModel } from "../three/item/ItemModel"
import { useDragOnPlane } from "../three/interaction/useDragOnPlane"

interface Props {
  item: CabinetItemVO
  transform: Transform
  planeHeight: number
  onChange: (t: Transform) => void
  onCommit: (t: Transform) => void
}

export function DraggableItem({ item, transform, planeHeight, onChange, onCommit }: Props) {
  const dragging = useRef(false)
  const { getPoint } = useDragOnPlane(planeHeight)

  const handleDown = (e: any) => {
    e.stopPropagation()
    dragging.current = true
  }
  const handleMove = () => {
    if (!dragging.current) return
    const p = getPoint()
    if (!p) return
    onChange({ ...transform, position: [p.x, planeHeight, p.z] })
  }
  const handleUp = () => {
    if (!dragging.current) return
    dragging.current = false
    onCommit(transform)
  }

  return (
    <group onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}>
      <ItemModel item={{ ...item, transform }} interactive={false} />
    </group>
  )
}
