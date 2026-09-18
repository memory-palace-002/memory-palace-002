import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { CollectionItem } from '../data/boxes'
import { useBookshelf } from '../store/bookshelf'
import { isTap } from '../lib/pointer'
import { dragRuntime, dragRuntimeLift, FLOOR_PLANE, dropAnim } from '../lib/drag'
import { SpriteView } from './OpenBook'

const ROOM_ITEM_SIZE = 0.22
const HOVER_LIFT = 0.08

/* 落点范围：本仓库房间（Room25D，6×6m）的可用地板范围。
 * 相机在 z≈2.45 第一人称朝 -z 看，所以 z 限制在房间中后段。 */
const X_RANGE: [number, number] = [-2.7, 2.7]
const Z_RANGE: [number, number] = [-2.4, 1.6]

export function ExtractedLayer() {
  const boxes = useBookshelf((s) => s.boxes)
  const drag = useBookshelf((s) => s.drag)
  const camera = useThree((s) => s.camera)
  const ghost = useRef<THREE.Group>(null!)

  const extracted = boxes.flatMap((b) =>
    b.items.filter((i) => i.extracted).map((i) => ({ boxId: b.id, item: i })),
  )
  const dragEntry = drag ? extracted.find((e) => e.item.id === drag.itemId) : null

  useFrame((state) => {
    const g = ghost.current
    if (!g) return
    if (!drag?.active || !dragEntry) {
      g.visible = false
      return
    }
    g.visible = true

    state.raycaster.setFromCamera(state.pointer, camera)

    const floorPoint = new THREE.Vector3()
    if (!state.raycaster.ray.intersectPlane(FLOOR_PLANE, floorPoint)) return

    floorPoint.x = THREE.MathUtils.clamp(floorPoint.x, X_RANGE[0], X_RANGE[1])
    floorPoint.z = THREE.MathUtils.clamp(floorPoint.z, Z_RANGE[0], Z_RANGE[1])

    const lift = THREE.MathUtils.clamp((state.pointer.y + 1) / 2, 0, 1) * 2.0
    dragRuntimeLift.value = lift

    const target = new THREE.Vector3(floorPoint.x, lift + HOVER_LIFT, floorPoint.z)
    dragRuntime.pos.copy(target)

    // 拖拽时：直接瞬移，跟手
    g.position.copy(target)
  })

  return (
    <group>
      {extracted.map(({ boxId, item }) => (
        <RoomItem key={item.id} boxId={boxId} item={item} />
      ))}
      <group ref={ghost} visible={false}>
        {dragEntry && (
          <group position={[0, ROOM_ITEM_SIZE / 2, 0]}>
            <SpriteView item={dragEntry.item} size={ROOM_ITEM_SIZE} opacity={0.65} interactive={false} />
          </group>
        )}
      </group>
    </group>
  )
}

function RoomItem({ boxId, item }: { boxId: string; item: CollectionItem }) {
  const beginDrag = useBookshelf((s) => s.beginDrag)
  const openDetail = useBookshelf((s) => s.openDetail)
  const ref = useRef<THREE.Group>(null!)

  const target = item.pos ?? [0, 0, 0]

  useFrame((state) => {
    if (!ref.current) return
    const now = state.clock.elapsedTime * 1000

    // 如果 dropAnim 处于激活状态，播放"滑向落点"的补间
    if (dropAnim.active) {
      const t = Math.min(1, (now - dropAnim.startTime) / dropAnim.duration)
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      ref.current.position.set(
        THREE.MathUtils.lerp(dropAnim.from.x, dropAnim.to.x, ease),
        THREE.MathUtils.lerp(dropAnim.from.y, dropAnim.to.y, ease),
        THREE.MathUtils.lerp(dropAnim.from.z, dropAnim.to.z, ease),
      )
      if (t >= 1) dropAnim.active = false
      return
    }

    // 没有拖拽、也没有落点动画时，直接贴着目标位置
    if (!useBookshelf.getState().drag?.active) {
      ref.current.position.set(target[0], target[1], target[2])
    }
  })

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    beginDrag(boxId, item.id, e.clientX, e.clientY)
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (isTap(e.clientX, e.clientY)) openDetail(boxId, item.id)
  }

  return (
    <group ref={ref} position={target as [number, number, number]} onPointerDown={onPointerDown} onClick={onClick}>
      <group position={[0, ROOM_ITEM_SIZE / 2, 0]}>
        <SpriteView item={item} size={ROOM_ITEM_SIZE} opacity={1} interactive />
      </group>
    </group>
  )
}
