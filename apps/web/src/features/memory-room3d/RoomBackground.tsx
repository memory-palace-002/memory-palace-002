/**
 * RoomBackground —— 房间背景组件（解耦重构产物）
 *
 * 只负责渲染固定不变的房间场景：
 *   - Canvas（相机配置 / 阴影 / 色调映射）
 *   - 天气灯光（WeatherLights：环境光 + 主光，随天气变化）
 *   - 房间模型（Room25D.jsx：地板/墙壁/大窗/长桌/椅/书柜/沙发/相框墙/窗外天空/降水/阳光）
 *   - 视角系统（三段式：鸟瞰 → 点击推进 → 室内转头）
 *
 * 视角流程：
 *   ① overview  鸟瞰全景：高空俯视整个房间，鼠标带轻微视差
 *   ② entering  点击画布任意处 → 二次贝塞尔曲线俯冲进屋（2.4s，缓入缓出），同时 fov 由 40→58
 *   ③ indoor    室内第一人称：站在房间中后段，一眼能看全左侧沙发和正前方书桌；
 *                按住鼠标右键拖动才转头（±17.2°，低灵敏度），松开即固定当前视角
 *
 * ⚠️ 分支纪律（feature-room-background）：本文件只做背景更换、房间模型美化、窗外天气变化、
 *    视角系统，绝对不包含任何物品摆放 / 拖拽 / 缩放 / AI 抠图逻辑。物品通过 children 挂载点注入。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Room25DModel } from './Room25D'

/* ---------- 视角关键位姿 ---------- */
/* 鸟瞰：高空斜俯视，能看全地板 + 后墙 + 两侧墙（天花板是单面材质，从上方自动不可见） */
const OVER = {
  pos: new THREE.Vector3(2.6, 6.6, 7.8),
  target: new THREE.Vector3(0, 0.35, -0.9),
  fov: 40,
}
/* 室内：退到房间中后段（房间进深 z = -3 ~ 3），相机 z=2.45、视线略偏左 0.42。
 * 这样左前方整张沙发（世界 x ≈ -2.9 ~ -1.2）能完整入画，
 * 正前方书桌（x=0, z=-2.45）仍落在画面中心偏右一点，不跑出构图。 */
const IN = {
  pos: new THREE.Vector3(0, 1.5, 2.45),
  target: new THREE.Vector3(-0.42, 1.0, -2.45),
  fov: 58,
}
/* 推进曲线的控制点：让镜头从房间正前方（没有墙的那一面）低空俯冲进来，
 * 既不会穿过天花板，也不会从墙里穿过去 */
const FLY_CTRL = new THREE.Vector3(0.6, 1.7, 3.2)
const FLY_DURATION = 2.4 // 秒

/* 转头参数（只有按住鼠标右键拖动才生效，松开后视角固定不动）
 * 灵敏度压得比较低：横向拖满约 215px 才走完 ±17.2°，避免快速摆动造成眩晕。
 * 不穿帮验算：转头 17.2° + 58°fov 在 16:9 下的水平半角 44.6° ≈ 61.8° < 90°，
 * 最外侧视线仍打在左右侧墙上（距侧墙 3，落点 z ≈ 0.84，仍在房间内），看不到房间外的空白。 */
const MAX_YAW = 0.3 // ±17.2°
const MAX_PITCH = 0.045 // ±2.6°，只做很轻微的抬头/低头
const YAW_SENS = 0.0014 // rad / px（向右拖 = 向右转头）
const PITCH_SENS = 0.0008 // rad / px（向下拖 = 向下看）
const LOOK_LAMBDA = 6 // 转头跟随的阻尼
/* 鸟瞰时的鼠标视差幅度 */
const PARALLAX = { x: 0.35, y: 0.18 }

type Phase = 'overview' | 'entering' | 'indoor'

/* ---------- 相机：三段式运镜 ---------- */
function CinematicRig({
  phase,
  paused,
  onArrive,
  onLookStart,
}: {
  phase: Phase
  paused: boolean // 拖动物品时暂停转头，避免拖拽平面被镜头带着跑
  onArrive: () => void
  onLookStart?: () => void // 用户第一次按住右键转头（用来收起提示）
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const mouse = useRef({ x: 0, y: 0 }) // 归一化鼠标位置 -1~1（只用于鸟瞰视差）
  const look = useRef({ yaw: 0, pitch: 0 }) // 当前朝向（阻尼后的值）
  const aim = useRef({ yaw: 0, pitch: 0 }) // 目标朝向（右键拖出来的值，松手后保持不变）
  const rmb = useRef(false) // 鼠标右键是否按下
  const last = useRef({ x: 0, y: 0 }) // 上一帧鼠标位置，用来算增量
  const cb = useRef(onLookStart)
  cb.current = onLookStart
  const flyT = useRef(0)
  const pos = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())
  const mat = useRef(new THREE.Matrix4())
  const qBase = useRef(new THREE.Quaternion())
  const qOffset = useRef(new THREE.Quaternion())
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

  /* 鼠标位置（全窗口，不需要hover在画布上） */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  /* 转头：按住鼠标右键拖动 → 累加增量到 aim；松开右键 aim 不再变化 → 视角固定。
   * 用增量（而不是鼠标绝对位置）驱动，所以鼠标停在屏幕角落时视角不会一直被拽着走。 */
  useEffect(() => {
    const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v))
    const down = (e: PointerEvent) => {
      if (e.button !== 2) return // 只认右键
      rmb.current = true
      last.current.x = e.clientX
      last.current.y = e.clientY
      cb.current?.()
    }
    const move = (e: PointerEvent) => {
      if (!rmb.current) return
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      last.current.x = e.clientX
      last.current.y = e.clientY
      aim.current.yaw = clamp(aim.current.yaw - dx * YAW_SENS, MAX_YAW)
      aim.current.pitch = clamp(aim.current.pitch - dy * PITCH_SENS, MAX_PITCH)
    }
    const up = (e: PointerEvent) => {
      if (e.button === 2) rmb.current = false
    }
    const cancel = () => {
      rmb.current = false
    }
    /* 画布上屏蔽浏览器右键菜单（页面其它 UI 保持正常右键） */
    const ctx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.tagName === 'CANVAS') e.preventDefault()
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('contextmenu', ctx)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('contextmenu', ctx)
    }
  }, [])

  useEffect(() => {
    if (phase === 'entering') flyT.current = 0
  }, [phase])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)

    /* ① 鸟瞰：固定机位 + 轻微鼠标视差 */
    if (phase === 'overview') {
      if (camera.fov !== OVER.fov) {
        camera.fov = OVER.fov
        camera.updateProjectionMatrix()
      }
      camera.position.set(
        OVER.pos.x + mouse.current.x * PARALLAX.x,
        OVER.pos.y - mouse.current.y * PARALLAX.y,
        OVER.pos.z
      )
      camera.lookAt(OVER.target)
      return
    }

    /* ② 推进：位置走二次贝塞尔，视线与 fov 同步插值 */
    if (phase === 'entering') {
      flyT.current += dt
      const u = Math.min(1, flyT.current / FLY_DURATION)
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2 // easeInOutCubic
      const iv = 1 - e
      pos.current.set(
        iv * iv * OVER.pos.x + 2 * iv * e * FLY_CTRL.x + e * e * IN.pos.x,
        iv * iv * OVER.pos.y + 2 * iv * e * FLY_CTRL.y + e * e * IN.pos.y,
        iv * iv * OVER.pos.z + 2 * iv * e * FLY_CTRL.z + e * e * IN.pos.z
      )
      camera.position.copy(pos.current)
      target.current.lerpVectors(OVER.target, IN.target, e)
      camera.lookAt(target.current)
      camera.fov = THREE.MathUtils.lerp(OVER.fov, IN.fov, e)
      camera.updateProjectionMatrix()
      if (u >= 1) onArrive()
      return
    }

    /* ③ 室内：站位固定，只有右键拖动改变 aim；松手后 aim 不变，视角就固定住 */
    if (!paused) {
      look.current.yaw = THREE.MathUtils.damp(look.current.yaw, aim.current.yaw, LOOK_LAMBDA, dt)
      look.current.pitch = THREE.MathUtils.damp(look.current.pitch, aim.current.pitch, LOOK_LAMBDA, dt)
    }
    if (camera.fov !== IN.fov) {
      camera.fov = IN.fov
      camera.updateProjectionMatrix()
    }
    camera.position.copy(IN.pos)
    /* 基础朝向看向书桌，再叠加转头偏移（局部空间旋转，避免翻滚） */
    mat.current.lookAt(camera.position, IN.target, camera.up)
    qBase.current.setFromRotationMatrix(mat.current)
    euler.current.set(look.current.pitch, look.current.yaw, 0)
    qOffset.current.setFromEuler(euler.current)
    camera.quaternion.copy(qBase.current).multiply(qOffset.current)
  })

  return null
}

/* ---------- 天气灯光 ---------- */
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

/* ---------- 进入提示 ---------- */
const HINT_STYLE: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: '9%',
  transform: 'translateX(-50%)',
  padding: '10px 22px',
  borderRadius: 999,
  background: 'rgba(61, 52, 40, 0.55)',
  color: '#fffaf0',
  fontSize: 14,
  letterSpacing: 2,
  pointerEvents: 'none',
  zIndex: 5,
  backdropFilter: 'blur(6px)',
  animation: 'mr3d-hint-pulse 2.2s ease-in-out infinite',
}

/* ---------- 房间背景 ----------
 * weather        天气（sunny | cloudy | rain | snow | ''）
 * cameraPaused   物品拖拽中 → 暂停转头（由物品侧传入，本组件不关心来源）
 * children       物品/贴片的 3D 挂载点（由父级 ItemPlacementScene 注入）
 */
export default function RoomBackground({
  weather = '',
  cameraPaused = false,
  children,
}: {
  weather?: string
  cameraPaused?: boolean
  children?: ReactNode
}) {
  const [phase, setPhase] = useState<Phase>('overview')
  const [looked, setLooked] = useState(false) // 用户是否已经用过右键转头

  /* 鸟瞰状态下点击画布任意处 → 开始推进。
   * 用捕获阶段监听：抢在 3D 物体的点击（选中/开卡片）之前触发，避免"进屋"时误开回忆卡片。 */
  useEffect(() => {
    if (phase !== 'overview') return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || t.tagName !== 'CANVAS') return // 只认画布上的点击，UI 控件照常响应
      e.stopPropagation()
      setPhase('entering')
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [phase])

  return (
    <>
      <Canvas
        shadows="basic"
        dpr={[1, 2]}
        camera={{ position: [OVER.pos.x, OVER.pos.y, OVER.pos.z], fov: OVER.fov }}
        style={{ position: 'absolute', inset: 0, cursor: phase === 'overview' ? 'pointer' : 'default' }}
        gl={{ toneMappingExposure: 1.0 }}
      >
        <color attach="background" args={['#f4efe6']} />
        <WeatherLights weather={weather} />
        <Room25DModel weather={weather} />
        {children}
        <CinematicRig
          phase={phase}
          paused={cameraPaused}
          onArrive={() => setPhase('indoor')}
          onLookStart={() => setLooked(true)}
        />
      </Canvas>
      {phase === 'overview' && <div style={HINT_STYLE}>点击进入房间</div>}
      {phase === 'indoor' && !looked && <div style={HINT_STYLE}>按住鼠标右键转头</div>}
      <style>{`@keyframes mr3d-hint-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }`}</style>
    </>
  )
}
