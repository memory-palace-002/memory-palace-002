import { useGLTF } from "@react-three/drei"
import { useMemo, useRef, useEffect } from "react"
import * as THREE from "three"

interface Props {
  url: string
}

export function CabinetModel({ url }: Props) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  const innerRef = useRef<THREE.Group>(null)

  useEffect(() => {
    if (!innerRef.current) return
    const box = new THREE.Box3().setFromObject(innerRef.current)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxXZ = Math.max(size.x, size.z)
    if (maxXZ > 0) {
      const scale = 1.5 / maxXZ
      innerRef.current.scale.setScalar(scale)
      const center = new THREE.Vector3()
      box.getCenter(center)
      innerRef.current.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
    }
  }, [cloned])

  return (
    <group ref={innerRef}>
      <primitive object={cloned} castShadow receiveShadow />
    </group>
  )
}