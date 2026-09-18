import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useRef } from 'react'
export function useDragOnPlane(planeHeight: number, bounds = 1.2) {
  const { camera, raycaster, pointer } = useThree()
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeHeight))
  const getPoint = () => {
    raycaster.setFromCamera(pointer, camera)
    const hit = new THREE.Vector3()
    const ok = raycaster.ray.intersectPlane(plane.current, hit)
    if (!ok) return null
    hit.x = THREE.MathUtils.clamp(hit.x, -bounds, bounds)
    hit.z = THREE.MathUtils.clamp(hit.z, -bounds, bounds)
    hit.y = planeHeight
    return hit
  }
  return { getPoint }
}