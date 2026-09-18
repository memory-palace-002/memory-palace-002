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
 *                按住鼠标左键在画布上拖动才转头（±17.2°，低灵敏度），松开即固定当前视角
 *
 * ⚠️ 分支纪律（feature-room-background）：本文件只做背景更换、房间模型美化、窗外天气变化、
 *    视角系统，绝对不包含任何物品摆放 / 拖拽 / 缩放 / AI 抠图逻辑。物品通过 children 挂载点注入。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Room25DModel, DESK_DRAWER, SEASON_OPTIONS, WALL_FRAME_X, WALL_FRAMES } from './Room25D'
import DrawerFolder from './DrawerFolder'
import PhotoWall, { loadWallPhotos } from './PhotoWall'

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
/* 抽屉俯视：镜头停在抽屉正上方偏前，略微前倾 22° 左右，能看进抽屉内部。
 * 全部由 Room25D 导出的 DESK_DRAWER 推导，改抽屉位置镜头会自动跟上。 */
const DRAWER_MID_Z = DESK_DRAWER.z + DESK_DRAWER.travel / 2 // 完全拉出后抽屉内腔的中心 z
const DRAWER_VIEW = {
  pos: new THREE.Vector3(DESK_DRAWER.x, DESK_DRAWER.y + 0.72, DRAWER_MID_Z + 0.32),
  target: new THREE.Vector3(DESK_DRAWER.x, DESK_DRAWER.y - 0.11, DRAWER_MID_Z - 0.01),
  fov: 52,
}

/* 照片墙：镜头推到右墙相框墙正前方。
 * 画面中心由 Room25D 导出的 WALL_FRAMES（错落相框的整体包围盒）推导，
 * 改相框位置/数量时镜头会自动跟着走。
 * 距离 2.9 / 视线压低 0.25 是算过的：5 个相框在屏幕上落在竖直 10.7%~66.6%、
 * 水平 32.8%~67.0%（16:9~4:3 都完整入画），正好在底部照片墙面板上方，
 * 相框占屏高约 56%，既够醒目又不会被面板挡住。 */
const WALL_BOX = WALL_FRAMES.reduce(
  (a, f) => ({
    zMin: Math.min(a.zMin, f.z - f.w / 2),
    zMax: Math.max(a.zMax, f.z + f.w / 2),
    yMin: Math.min(a.yMin, f.y - f.h / 2),
    yMax: Math.max(a.yMax, f.y + f.h / 2),
  }),
  { zMin: Infinity, zMax: -Infinity, yMin: Infinity, yMax: -Infinity }
)
const WALL_CZ = (WALL_BOX.zMin + WALL_BOX.zMax) / 2
const WALL_CY = (WALL_BOX.yMin + WALL_BOX.yMax) / 2
const WALL_VIEW = {
  pos: new THREE.Vector3(WALL_FRAME_X - 2.9, WALL_CY + 0.06, WALL_CZ + 0.02),
  target: new THREE.Vector3(WALL_FRAME_X, WALL_CY - 0.25, WALL_CZ),
  fov: 44,
}

/* 推进曲线的控制点：让镜头从房间正前方（没有墙的那一面）低空俯冲进来，
 * 既不会穿过天花板，也不会从墙里穿过去 */
const FLY_CTRL = new THREE.Vector3(0.6, 1.7, 3.2)
const FLY_DURATION = 2.4 // 秒
/* 室内 ↔ 抽屉：距离短，1.1s 够用且不拖沓 */
const DRAWER_FLY_DURATION = 1.1 // 秒
/* 室内 ↔ 照片墙：从房中间推到右墙，距离比抽屉远，给 1.2s 让推进更「丝滑」 */
const WALL_FLY_DURATION = 1.2 // 秒

/* 转头参数（只有按住鼠标左键在画布上拖动才生效，松开后视角固定不动）
 * 左键同时用于「选中/打开回忆卡片」和「拖动物品」，所以加了三重防护：
 *   ① pointerdown 的 target 必须是 CANVAS（在 HTML 面板上拖动不算）
 *   ② 累计位移超过 DRAG_THRESHOLD 才真的开始转头（单击不会让视角抖动）
 *   ③ 拖动物品期间（paused）完全不转头，避免物品和镜头一起动
 * 灵敏度压得比较低：横向拖满约 215px 才走完 ±17.2°，避免快速摆动造成眩晕。
 * 不穿帮验算：转头 17.2° + 58°fov 在 16:9 下的水平半角 44.6° ≈ 61.8° < 90°，
 * 最外侧视线仍打在左右侧墙上（距侧墙 3，落点 z ≈ 0.84，仍在房间内），看不到房间外的空白。 */
const MAX_YAW = 0.3 // ±17.2°
const MAX_PITCH = 0.045 // ±2.6°，只做很轻微的抬头/低头
const YAW_SENS = 0.0014 // rad / px（向右拖 = 向右转头）
const PITCH_SENS = 0.0008 // rad / px（向下拖 = 向下看）
const LOOK_LAMBDA = 6 // 转头跟随的阻尼
const DRAG_THRESHOLD = 4 // px：位移超过这个距离才算「拖动转头」，单击不受影响
/* 鸟瞰时的鼠标视差幅度 */
const PARALLAX = { x: 0.35, y: 0.18 }

type Phase = 'overview' | 'entering' | 'indoor' | 'drawer' | 'wall'

type View = { pos: THREE.Vector3; target: THREE.Vector3; fov: number }

const UP = new THREE.Vector3(0, 1, 0)
/* 相机的朝向四元数（Matrix4.lookAt 是相机约定：-Z 为前方，不是 Object3D 的 +Z） */
const _lookMat = new THREE.Matrix4()
function viewQuaternion(v: View): THREE.Quaternion {
  _lookMat.lookAt(v.pos, v.target, UP)
  return new THREE.Quaternion().setFromRotationMatrix(_lookMat)
}
const DRAWER_Q = viewQuaternion(DRAWER_VIEW)
const WALL_Q = viewQuaternion(WALL_VIEW)

const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)

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
  onLookStart?: () => void // 用户第一次拖动转头（用来收起提示）
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const mouse = useRef({ x: 0, y: 0 }) // 归一化鼠标位置 -1~1（只用于鸟瞰视差）
  const look = useRef({ yaw: 0, pitch: 0 }) // 当前朝向（阻尼后的值）
  const aim = useRef({ yaw: 0, pitch: 0 }) // 目标朝向（拖出来的值，松手后保持不变）
  const drag = useRef(false) // 左键是否正按在画布上
  const moved = useRef(0) // 本次按下累计位移，超过阈值才开始转头
  const last = useRef({ x: 0, y: 0 }) // 上一次鼠标位置，用来算增量
  /* paused 是 prop，放进 ref 才能在事件回调里读到最新值 */
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const cb = useRef(onLookStart)
  cb.current = onLookStart
  const arriveRef = useRef(onArrive)
  arriveRef.current = onArrive
  /* 一次运镜：从「按下开关那一刻的真实相机状态」飞到目标视角，
   * 所以不管是 鸟瞰→室内、室内→抽屉、抽屉→室内 都能复用同一套插值。 */
  const fly = useRef<{
    t: number
    dur: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    ctrl: THREE.Vector3 | null // 有控制点时走二次贝塞尔（进屋那条弧线）
    fromQ: THREE.Quaternion
    toQ: THREE.Quaternion
    fromFov: number
    toFov: number
  } | null>(null)
  const pos = useRef(new THREE.Vector3())
  const mat = useRef(new THREE.Matrix4())
  const qBase = useRef(new THREE.Quaternion())
  const qOffset = useRef(new THREE.Quaternion())
  const qTmp = useRef(new THREE.Quaternion())
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

  /* 转头：按住鼠标左键在画布上拖动 → 累加增量到 aim；松开左键 aim 不再变化 → 视角固定。
   * 用增量（而不是鼠标绝对位置）驱动，所以鼠标停在屏幕角落时视角不会一直被拽着走。 */
  useEffect(() => {
    const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v))
    const onCanvas = (e: Event) => {
      const t = e.target as HTMLElement | null
      return !!t && t.tagName === 'CANVAS'
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return // 只认左键
      if (!onCanvas(e)) return // 在 HTML 面板上按下的不算（UI 控件照常工作）
      drag.current = true
      moved.current = 0
      last.current.x = e.clientX
      last.current.y = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      last.current.x = e.clientX
      last.current.y = e.clientY
      /* 拖动物品时不转头（物品拖拽优先） */
      if (pausedRef.current) return
      moved.current += Math.abs(dx) + Math.abs(dy)
      if (moved.current < DRAG_THRESHOLD) return // 还只是「点击」，先不动视角
      cb.current?.()
      aim.current.yaw = clamp(aim.current.yaw - dx * YAW_SENS, MAX_YAW)
      aim.current.pitch = clamp(aim.current.pitch - dy * PITCH_SENS, MAX_PITCH)
    }
    const up = (e: PointerEvent) => {
      if (e.button === 0) drag.current = false
    }
    const cancel = () => {
      drag.current = false
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [])

  /* 阶段切换 → 起一次运镜 */
  const prevPhase = useRef<Phase>('overview')
  useEffect(() => {
    const prev = prevPhase.current
    prevPhase.current = phase
    if (phase === 'overview') {
      fly.current = null
      return
    }
    /* 进屋：走带控制点的弧线；室内/抽屉之间：直线插值就够（都在房间里，不会穿墙） */
    if (phase === 'entering') {
      startFly(IN, FLY_DURATION, FLY_CTRL)
      return
    }
    /* entering 结束时已经落到室内了，不要再飞一次（否则会多出一段 0 距离的等待） */
    if (phase === 'indoor' && prev === 'entering') return
    /* 抽屉 / 照片墙：各自用自己的一套目标视角与时长；其余情况回室内 */
    if (phase === 'drawer') {
      startFly(DRAWER_VIEW, DRAWER_FLY_DURATION, null)
      return
    }
    if (phase === 'wall') {
      startFly(WALL_VIEW, WALL_FLY_DURATION, null)
      return
    }
    startFly(IN, DRAWER_FLY_DURATION, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function startFly(to: View, dur: number, ctrl: THREE.Vector3 | null) {
    fly.current = {
      t: 0,
      dur,
      fromPos: camera.position.clone(),
      toPos: to.pos.clone(),
      ctrl,
      fromQ: camera.quaternion.clone(),
      toQ: viewQuaternion(to),
      fromFov: camera.fov,
      toFov: to.fov,
    }
  }

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

    /* ② 运镜中：位置（贝塞尔或直线）+ 朝向四元数 slerp + fov，三者同步插值 */
    const f = fly.current
    if (f) {
      f.t += dt
      const u = Math.min(1, f.t / f.dur)
      const e = easeInOutCubic(u)
      if (f.ctrl) {
        const iv = 1 - e
        pos.current.set(
          iv * iv * f.fromPos.x + 2 * iv * e * f.ctrl.x + e * e * f.toPos.x,
          iv * iv * f.fromPos.y + 2 * iv * e * f.ctrl.y + e * e * f.toPos.y,
          iv * iv * f.fromPos.z + 2 * iv * e * f.ctrl.z + e * e * f.toPos.z
        )
      } else {
        pos.current.lerpVectors(f.fromPos, f.toPos, e)
      }
      camera.position.copy(pos.current)
      /* 用四元数 slerp 而不是逐帧 lookAt：转向更顺，且不会产生滚转 */
      qTmp.current.copy(f.fromQ).slerp(f.toQ, e)
      camera.quaternion.copy(qTmp.current)
      camera.fov = THREE.MathUtils.lerp(f.fromFov, f.toFov, e)
      camera.updateProjectionMatrix()
      if (u >= 1) {
        fly.current = null
        if (phase === 'entering') arriveRef.current()
      }
      return
    }

    if (phase === 'entering') return // 运镜还没起飞（等 effect 触发），先别动

    /* ③ 抽屉俯视：定在抽屉上方，不再响应转头 */
    if (phase === 'drawer') {
      if (camera.fov !== DRAWER_VIEW.fov) {
        camera.fov = DRAWER_VIEW.fov
        camera.updateProjectionMatrix()
      }
      camera.position.copy(DRAWER_VIEW.pos)
      camera.quaternion.copy(DRAWER_Q)
      return
    }

    /* ③′ 照片墙：定在相框墙正前方，同样不再响应转头 */
    if (phase === 'wall') {
      if (camera.fov !== WALL_VIEW.fov) {
        camera.fov = WALL_VIEW.fov
        camera.updateProjectionMatrix()
      }
      camera.position.copy(WALL_VIEW.pos)
      camera.quaternion.copy(WALL_Q)
      return
    }

    /* ④ 室内：站位固定，只有拖动改变 aim；松手后 aim 不变，视角就固定住 */
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

function WeatherLights({
  weather,
  seasonLight,
}: {
  weather: string
  seasonLight?: (typeof SEASON_OPTIONS)[number]
}) {
  const W = WEATHER_LIGHT[weather] ?? { ambient: 0.8, dir: 0.9, tint: '#fff4e6' }
  /* 四季优先：选了季节时，环境光/主光的强度与色调都随季节走（春清爽、夏炽烈、秋暖橙、冬冷暗） */
  const ambient = seasonLight ? seasonLight.ambient : W.ambient
  const ambientColor = seasonLight ? seasonLight.ambientColor : '#fff4e6'
  const dir = seasonLight ? seasonLight.dir : W.dir
  const tint = seasonLight ? seasonLight.light : W.tint
  return (
    <>
      <ambientLight intensity={ambient} color={ambientColor} />
      <directionalLight
        position={[2.5, 5, 4]}
        intensity={dir}
        color={tint}
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

/* ---------- 抽屉打开时的背景虚化 ----------
 * backdrop-filter 会把整个画布都糊掉，所以用 mask 在中间挖一个「清晰的洞」，
 * 让抽屉本身保持清晰、四周（房间其余部分）被虚化 + 压暗，形成景深聚焦的效果。 */
const BLUR_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 4,
  backdropFilter: 'blur(9px) saturate(0.85)',
  WebkitBackdropFilter: 'blur(9px) saturate(0.85)',
  background: 'radial-gradient(ellipse 46% 42% at 50% 52%, rgba(0,0,0,0) 55%, rgba(30,22,12,0.4) 100%)',
  maskImage: 'radial-gradient(ellipse 30% 27% at 50% 52%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 52%, #000 100%)',
  WebkitMaskImage:
    'radial-gradient(ellipse 30% 27% at 50% 52%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 52%, #000 100%)',
  animation: 'mr3d-fade-in .55s ease both',
}

/* ---------- 照片墙时的背景虚化 ----------
 * 和抽屉不同：这里前景是一整块底部面板，不需要在中间留「清晰的洞」，
 * 所以整屏虚化 + 压暗，形成明显的景深聚焦（房间退成背景）。 */
const WALL_BLUR_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 4,
  backdropFilter: 'blur(11px) saturate(0.88)',
  WebkitBackdropFilter: 'blur(11px) saturate(0.88)',
  background:
    'radial-gradient(ellipse 78% 72% at 50% 42%, rgba(28,20,12,0.16) 0%, rgba(28,20,12,0.52) 100%)',
  animation: 'mr3d-fade-in .5s ease both',
}

/* 弹窗容器：水平居中，垂直略偏下（给上方抽屉留空间） */
const POPUP_WRAP_STYLE: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '58%',
  transform: 'translate(-50%, -50%)',
  zIndex: 6,
}

const DRAWER_HINT_STYLE: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: '4%',
  transform: 'translateX(-50%)',
  padding: '6px 16px',
  borderRadius: 999,
  background: 'rgba(61, 52, 40, 0.35)',
  color: '#fffaf0',
  fontSize: 12,
  letterSpacing: 1,
  pointerEvents: 'none',
  zIndex: 5,
}

/* 相框墙提示：放右下角，和底部中间那两条提示错开，互不遮拦 */
const WALL_HINT_STYLE: CSSProperties = {
  position: 'absolute',
  right: 14,
  bottom: '4%',
  padding: '6px 16px',
  borderRadius: 999,
  background: 'rgba(61, 52, 40, 0.35)',
  color: '#fffaf0',
  fontSize: 12,
  letterSpacing: 1,
  pointerEvents: 'none',
  zIndex: 5,
}

/* ---------- 房间背景 ----------
 * weather        天气（sunny | cloudy | rain | snow | ''）
 * season         四季（'spring'|'summer'|'autumn'|'winter'|''），由父级持有（左侧功能栏切换）
 * cameraPaused   物品拖拽中 → 暂停转头（由物品侧传入，本组件不关心来源）
 * children       物品/贴片的 3D 挂载点（由父级 ItemPlacementScene 注入）
 */
export default function RoomBackground({
  weather = '',
  season = '',
  cameraPaused = false,
  children,
}: {
  weather?: string
  season?: string
  cameraPaused?: boolean
  children?: ReactNode
}) {
  const [base, setBase] = useState<Phase>('overview') // 鸟瞰 / 推进中 / 室内
  const [drawerOpen, setDrawerOpen] = useState(false) // 抽屉是否拉出
  const [looked, setLooked] = useState(false) // 用户是否已经拖动转过头
  /* 四季的窗光/明暗参数（切换入口在左侧悬浮功能栏 RoomToolbar） */
  const seasonLight = SEASON_OPTIONS.find((s) => s.id === season)
  /* 照片墙：点右墙相框进入。framePhotos 与 PhotoWall 共用同一份 localStorage 数据，
   * 前 5 张会被贴到房间的相框上（Room25D 的 WallFrames） */
  const [wallOpen, setWallOpen] = useState(false)
  const [framePhotos, setFramePhotos] = useState<string[]>(loadWallPhotos)
  /* 抽屉拉出时镜头切到抽屉俯视，打开照片墙时切到相框墙；都关上后回到室内 */
  const phase: Phase = drawerOpen ? 'drawer' : wallOpen ? 'wall' : base

  /* 文件夹弹窗的三段式状态（闭合/扇形/手账页）由 DrawerFolder 内部管理，
   * 这里只负责把整个抽屉连同弹窗一起收起。 */
  const closeDrawer = () => setDrawerOpen(false)

  /* 鸟瞰状态下点击画布任意处 → 开始推进。
   * 用捕获阶段监听：抢在 3D 物体的点击（选中/开卡片）之前触发，避免"进屋"时误开回忆卡片。 */
  useEffect(() => {
    if (phase !== 'overview') return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || t.tagName !== 'CANVAS') return // 只认画布上的点击，UI 控件照常响应
      e.stopPropagation()
      setBase('entering')
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
        <color attach="background" args={[seasonLight ? seasonLight.bg : '#f4efe6']} key={seasonLight ? seasonLight.id : 'default'} />
        <WeatherLights weather={weather} seasonLight={seasonLight} />
        <Room25DModel
          weather={weather}
          season={season}
          drawerOpen={drawerOpen}
          onDrawerToggle={() => {
            if (wallOpen) return // 照片墙开着时不响应抽屉，避免两个前景态互相打架
            drawerOpen ? closeDrawer() : setDrawerOpen(true)
          }}
          framePhotos={framePhotos}
          onFrameClick={() => {
            /* 只在「站在房间里」时响应：鸟瞰/推进中/已在抽屉或照片墙里都不重复触发 */
            if (drawerOpen || wallOpen || base !== 'indoor') return
            setWallOpen(true)
          }}
        />
        {children}
        <CinematicRig
          phase={phase}
          paused={cameraPaused}
          onArrive={() => setBase('indoor')}
          onLookStart={() => setLooked(true)}
        />
      </Canvas>

      {/* 抽屉拉开时：背景虚化 + 压暗四周，中间给抽屉留出清晰区域 */}
      {phase === 'drawer' && <div style={BLUR_STYLE} />}

      {/* 文件夹手账弹窗（三段式：闭合文件夹 → 扇形纸张 → 手账页面） */}
      {phase === 'drawer' && (
        <div style={POPUP_WRAP_STYLE}>
          <DrawerFolder onClose={closeDrawer} />
        </div>
      )}

      {phase === 'overview' && <div style={HINT_STYLE}>点击进入房间</div>}
      {phase === 'indoor' && !looked && <div style={HINT_STYLE}>按住鼠标左键拖动转头</div>}
      {phase === 'indoor' && !drawerOpen && <div style={DRAWER_HINT_STYLE}>点击书桌抽屉可以拉开</div>}
      {phase === 'indoor' && <div style={WALL_HINT_STYLE}>点击右侧相框墙 → 照片墙</div>}

      {/* 照片墙：整屏虚化 + 底部照片墙面板（镜头由 CinematicRig 的 'wall' 阶段推进） */}
      {phase === 'wall' && <div style={WALL_BLUR_STYLE} />}
      {phase === 'wall' && <PhotoWall onClose={() => setWallOpen(false)} onPhotosChange={setFramePhotos} />}

      <style>{`@keyframes mr3d-hint-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
@keyframes mr3d-fade-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </>
  )
}
