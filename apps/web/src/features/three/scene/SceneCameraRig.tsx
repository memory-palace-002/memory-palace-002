import { OrbitControls } from '@react-three/drei'
export function SceneCameraRig() {
  return (
    <OrbitControls makeDefault enablePan={false} minDistance={1.2} maxDistance={4} maxPolarAngle={Math.PI / 2.2} minPolarAngle={Math.PI / 6} />
  )
}