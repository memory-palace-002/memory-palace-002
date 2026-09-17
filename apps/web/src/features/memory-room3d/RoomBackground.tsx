/**
 * RoomBackground —— 房间背景组件（解耦重构产物）
 *
 * 只负责渲染固定不变的房间场景：
 *   - Canvas（相机配置 / 阴影 / 色调映射）
 *   - 天气灯光（WeatherLights：环境光 + 主光，随天气变化）
 *   - 房间模型（Room25D.jsx：地板/墙壁/大窗/长桌/椅/书柜/沙发/相框墙/窗外天空/降水/阳光）
 *   - 视角控制（CameraRig：平视锁定，仅轻微平移 + 缩放；拖动物品时可暂停）
 *
 * ⚠️ 分支纪律（feature-room-background）：本文件只做背景更换、房间模型美化、窗外天气变化，
 *    绝对不包含任何物品摆放 / 拖拽 / 缩放 / AI 抠图逻辑。物品通过 children 挂载点注入。
 */
import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Room25DModel } from './Room25D'

/* ---------- 相机（平视 2.5D，与 Room25D 一致） ---------- */
const CAM_Y = 1.35
const PAN_X = 1.2 // 左右平移范围 ±1.2

/* ---------- 相机：平视锁定，仅轻微平移 + 缩放（自 MemoryRoom3D 原样搬入） ---------- */
function CameraRig({ paused }: { paused: boolean }) {
  const controls = useRef<any>(null)
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const c = controls.current
    if (!c) return
    c.target.x = THREE.MathUtils.clamp(c.target.x, -PAN_X, PAN_X)
    c.target.y = CAM_Y
    c.target.z = 0
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -PAN_X, PAN_X)
    camera.position.y = CAM_Y
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, 5, 13)
  })
  return (
    <OrbitControls
      ref={controls}
      enabled={!paused}
      target={[0, CAM_Y, 0]}
      enableRotate={false}
      enableZoom
      enablePan
      screenSpacePanning
      minAzimuthAngle={0}
      maxAzimuthAngle={0}
      minPolarAngle={Math.PI / 2}
      maxPolarAngle={Math.PI / 2}
      minDistance={5}
      maxDistance={13}
    />
  )
}

/* ---------- 天气灯光（自 MemoryRoom3D 原样搬入） ---------- */
const WEATHER_LIGHT: Record<string, { ambient: number; dir: number; tint: string }> = {
  sunny: { ambient: 1.02, dir: 1.35, tint: '#fff3da' }, // 晴天：更亮更暖
  cloudy: { ambient: 0.58, dir: 0.38, tint: '#e3e9ee' }, // 阴天：压暗
  rain: { ambient: 0.62, dir: 0.32, tint: '#d8e2e9' },
  snow: { ambient: 0.8, dir: 0.5, tint: '#eaf1f6' },
}

function WeatherLights({ weather }: { weather: string }) {
  const W = WEATHER_LIGHT[weather] ?? { ambient: 0.8, dir: 0.9, tint: '#fff4e6' }
  return (
    <>
      <ambientLight intensity={W.ambient} color="#fff4e6" />
      <directionalLight
        position={[2.5, 5, 4]}
        intensity={W.dir}
        color={W.tint}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
    </>
  )
}

/* ---------- 房间背景 ----------
 * weather        天气（sunny | cloudy | rain | snow | ''）
 * cameraPaused   物品拖拽中 → 暂停相机控制（由物品侧传入，本组件不关心来源）
 * children       物品/贴片的 3D 挂载点（由父级 ItemPlacementScene 注入）
 */
export default function RoomBackground({
  weather = '',
  cameraPaused = false,
  children,
}: {
  weather?: string
  cameraPaused?: boolean
  children?: React.ReactNode
}) {
  return (
    <Canvas
      shadows="basic"
      dpr={[1, 2]}
      camera={{ position: [0, CAM_Y, 9], fov: 35 }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ toneMappingExposure: 1.0 }}
    >
      <color attach="background" args={['#f4efe6']} />
      <WeatherLights weather={weather} />
      <Room25DModel weather={weather} />
      {children}
      <CameraRig paused={cameraPaused} />
    </Canvas>
  )
}
