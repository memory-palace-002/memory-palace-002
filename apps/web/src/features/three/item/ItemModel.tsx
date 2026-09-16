import { useEffect, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import MatchaCup from "./MatchaCup"
import type { CabinetItemVO } from "@memory-palace/shared"

interface Props {
  item: CabinetItemVO
  highlighted?: boolean
  onPointerOver?: (e: any) => void
  onPointerOut?: (e: any) => void
  onClick?: (e: any) => void
  interactive?: boolean
}

/** 杯子模型的原始包围盒最大边约为 3.2（高 3.2 / 口径 2.3），
 *  归一化到与场景中其他物品一致的 0.35 单位 */
const TARGET_SIZE = 0.35

export function ItemModel({ item, highlighted, onPointerOver, onPointerOut, onClick, interactive = true }: Props) {
  const group = useRef<THREE.Group>(null)
  const innerRef = useRef<THREE.Group>(null)

  // 尺寸归一化：把 MatchaCup 缩放并居中到场景统一尺寸
  useEffect(() => {
    if (!innerRef.current) return
    const box = new THREE.Box3().setFromObject(innerRef.current)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      const scale = TARGET_SIZE / maxDim
      innerRef.current.scale.setScalar(scale)
      const center = new THREE.Vector3()
      box.getCenter(center)
      innerRef.current.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
    }
  }, [])

  // 高亮时整体轻微放大（作用在外层 group，不干扰 item.transform 的缩放）
  useFrame(() => {
    if (!group.current) return
    const target = highlighted ? 1.15 : 1
    const s = THREE.MathUtils.lerp(group.current.scale.x, target, 0.15)
    group.current.scale.setScalar(s)
  })

  const t = item.transform

  return (
    <group
      ref={group}
      position={t.position}
      rotation={t.rotation}
      onPointerOver={interactive ? onPointerOver : undefined}
      onPointerOut={interactive ? onPointerOut : undefined}
      onClick={interactive ? onClick : undefined}
    >
      {/* item.transform 的缩放放在中间层，与高亮动画、尺寸归一化互不影响 */}
      <group scale={t.scale}>
        <group ref={innerRef}>
          <MatchaCup />
        </group>
      </group>
    </group>
  )
}
