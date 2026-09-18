import { Canvas } from '@react-three/fiber'
import { Suspense, type ReactNode } from 'react'
import { SceneLights } from './SceneLights'
import { SceneCameraRig } from './SceneCameraRig'
import { useRenderPause } from './useRenderPause'
import { useGLTFPreload } from '../loading/useGLTFPreload'
import { LoadingOverlay } from '../loading/LoadingOverlay'

interface Props {
  children: ReactNode
  disableOrbit?: boolean
  onPointerMissed?: () => void
}

export function SceneCanvas({ children, disableOrbit, onPointerMissed }: Props) {
  useGLTFPreload()
  const paused = useRenderPause()

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        frameloop={paused ? 'demand' : 'always'}
        camera={{ position: [0, 2, 5], fov: 50 }}
        onPointerMissed={onPointerMissed}
      >
        <SceneLights />
        {!disableOrbit && <SceneCameraRig />}
        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
      <LoadingOverlay />
    </div>
  )
}