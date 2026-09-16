/**
 * MemoryRoom3D —— 3D 回忆房间（暖色房间 + 自由贴片 + 天气联动）
 *
 * 场景：Room25D.jsx 的暖色房间（米白墙 / 浅木地板 / 大窗 / 长桌 / 帆布椅 / 书柜 / 顶灯）
 * 贴片：上传图片 → 先弹窗三选一：
 *        ① 自动扣图 —— AI 沿边缘抠图（U²-Netp）→ 贴合白边 → 做成贴纸
 *        ② 手动截取 —— 画布上自己圈出想保留的部分 → 贴合白边 → 做成贴纸
 *        ③ 直接放入 —— 原图整张放入，不做任何处理（和之前的直接放一样）
 *       贴片悬浮在房间里，可以随意拖动（普通拖动上下左右，按住 Shift 拖动前后移动），
 *       不再固定在桌面上；影子会自动落在正下方的桌面或地板上。
 *       悬停弹性放大，点击弹出回忆卡片（便利贴后的虚化背景会跟天气一起下雨/下雪）
 * 天气：卡片里选天气 → 窗外天空 / 窗光 / 室内光跟着变；雨天窗外有 ≈14.6° 倾斜的雨丝
 *
 * 依赖：@huggingface/transformers（模型在 public/models/BritishWerewolf/U-2-Netp/）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Room25DModel, DESK_TOP_Y, DESK_Z, DESK_L } from './Room25D'
import { stickerize, addStickerBorder, cutWithLasso, flattenImage } from './matting'
import './MemoryRoom3D.css'

/* ---------- 常量 ---------- */
const STORAGE_KEY = 'memory-room3d/stickers-v1'
const CAM_Y = 1.35
const PAN_X = 1.2
const STAND_H = 0.26 // 贴片的显示高度（世界单位）

/* 拖动活动范围（房间内）：左右 / 高度 / 前后 */
const BOUND = { x: 2.7, yMin: 0.03, yMax: 2.75, zMin: -2.85, zMax: 3.6 }

const WEATHERS = [
  { key: 'sunny', icon: '☀️', label: '晴' },
  { key: 'cloudy', icon: '⛅', label: '多云' },
  { key: 'rain', icon: '🌧️', label: '雨' },
  { key: 'snow', icon: '❄️', label: '雪' },
]

interface StickerMeta {
  name?: string
  date?: string
  weather?: string
  text?: string
  summary?: string
}

interface Sticker3D {
  id: string
  src: string // 原图（卡片用）
  sticker: string // 3D 贴片贴图（抠图/截取后的版本）
  w: number // 贴图像素宽
  h: number // 贴图像素高
  x: number // 世界坐标 x
  y: number // 贴片底部离地高度（世界坐标，可悬浮）
  z: number // 世界坐标 z
  rotY: number // 朝向微偏（弧度）
  meta: StickerMeta | null
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const uid = () => Math.random().toString(36).slice(2, 9)

/* 新贴片出生点：桌前空中（不再落在桌面上），用户可再随意拖动 */
function spawnPose() {
  return {
    x: clamp(-0.7 + Math.random() * 1.4, -BOUND.x, BOUND.x),
    y: clamp(0.82 + Math.random() * 0.3, BOUND.yMin, BOUND.yMax),
    z: clamp(DESK_Z + 1.7 + Math.random() * 0.4, BOUND.zMin, BOUND.zMax),
    rotY: (Math.random() - 0.5) * 0.2,
  }
}

/* 读取本地存档：老数据没有 y（当时贴片站在桌上），补上桌面高度 */
function loadStickers(): Sticker3D[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Sticker3D[]
    return list.map((s) => ({ ...s, y: typeof s.y === 'number' ? s.y : DESK_TOP_Y }))
  } catch {
    return []
  }
}

/* ---------- 相机：平视锁定，仅轻微平移 + 缩放（与 Room25D 一致） ---------- */
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

/* ---------- 天气灯光 ---------- */
const WEATHER_LIGHT: Record<string, { ambient: number; dir: number; tint: string }> = {
  sunny: { ambient: 0.9, dir: 1.05, tint: '#fff4e2' },
  cloudy: { ambient: 0.76, dir: 0.55, tint: '#eef2f6' },
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

/* ---------- 3D 贴片（可自由拖动的悬浮平面） ---------- */
function StickerPlane({
  s,
  picked,
  onPick,
  onDragActive,
  onMove,
}: {
  s: Sticker3D
  picked: boolean
  onPick: (id: string) => void
  onDragActive: (active: boolean) => void
  onMove: (p: { x: number; y: number; z: number }) => void
}) {
  const group = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)
  /* 拖动状态：mode 'v' = 在贴片所在的竖直平面里拖（上下左右），'h' = 在当前高度的水平面里拖（前后） */
  const drag = useRef<{ mode: 'v' | 'h'; plane: THREE.Plane; offset: THREE.Vector3 } | null>(null)
  const movedRef = useRef(false) // 本次按下后是否真的拖动过（用来抑制拖完误触点击）

  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load(s.sticker)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [s.sticker])

  useEffect(() => () => tex.dispose(), [tex])

  useFrame(() => {
    if (!group.current) return
    const target = hovered || picked ? 1.12 : 1
    const cur = group.current.scale.x
    const next = THREE.MathUtils.lerp(cur, target, 0.18)
    group.current.scale.setScalar(next)
  })

  const worldH = STAND_H
  const worldW = (worldH * s.w) / s.h

  /* 影子落在贴片正下方的承接面上：在桌面范围内且高于桌面 → 落桌面，否则落地板 */
  const overDesk = Math.abs(s.x) <= DESK_L / 2 + 0.15 && Math.abs(s.z - DESK_Z) <= 0.36
  const shadowY = overDesk && s.y >= DESK_TOP_Y - 0.001 ? DESK_TOP_Y : 0.012
  const hAbove = Math.max(0, s.y - shadowY)
  const shadowOp = 0.18 / (1 + hAbove * 1.4)
  const shadowR = Math.max(worldW * 0.42, 0.05)

  const setCursor = (c: string) => {
    document.body.style.cursor = c
  }

  /* 根据模式构建拖动平面：竖直面（z 固定）或水平面（y 固定），都过贴片当前位置 */
  const buildPlane = (mode: 'v' | 'h', wp: THREE.Vector3) =>
    new THREE.Plane().setFromNormalAndCoplanarPoint(
      mode === 'v' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0),
      wp
    )

  const beginDrag = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (drag.current) return
    const g = group.current
    if (!g) return
    const wp = new THREE.Vector3()
    g.getWorldPosition(wp)
    const mode: 'v' | 'h' = e.shiftKey ? 'h' : 'v'
    const plane = buildPlane(mode, wp)
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(plane, hit)) return
    drag.current = { mode, plane, offset: wp.clone().sub(hit) }
    movedRef.current = false
    try {
      ;(e.target as any).setPointerCapture?.(e.pointerId)
    } catch {
      /* 忽略捕获失败 */
    }
    setCursor('grabbing')
    onDragActive(true)
  }

  const moveDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current
    if (!d) return
    e.stopPropagation()
    /* 拖动中途按住 / 松开 Shift：动态切换拖动平面（上下左右 ↔ 前后） */
    const want: 'v' | 'h' = e.shiftKey ? 'h' : 'v'
    if (want !== d.mode) {
      const g = group.current
      if (g) {
        const wp = new THREE.Vector3()
        g.getWorldPosition(wp)
        d.plane.copy(buildPlane(want, wp))
        const hit = new THREE.Vector3()
        if (e.ray.intersectPlane(d.plane, hit)) d.offset.copy(wp).sub(hit)
      }
      d.mode = want
    }
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(d.plane, hit)) return
    const p = hit.add(d.offset)
    movedRef.current = true
    onMove({
      x: clamp(p.x, -BOUND.x, BOUND.x),
      y: clamp(p.y, BOUND.yMin, BOUND.yMax),
      z: clamp(p.z, BOUND.zMin, BOUND.zMax),
    })
  }

  const finishDrag = useCallback(() => {
    if (!drag.current) return
    drag.current = null
    setCursor(hoveredRef.current ? 'grab' : '')
    onDragActive(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDragActive])

  return (
    <group
      ref={group}
      position={[s.x, s.y, s.z]}
      rotation={[0, s.rotY, 0]}
      onPointerOver={(e) => {
        e.stopPropagation()
        hoveredRef.current = true
        setHovered(true)
        if (!drag.current) setCursor('grab')
      }}
      onPointerOut={() => {
        hoveredRef.current = false
        setHovered(false)
        if (!drag.current) setCursor('')
      }}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={(e) => {
        if (!drag.current) return
        e.stopPropagation()
        try {
          ;(e.target as any).releasePointerCapture?.(e.pointerId)
        } catch {
          /* 忽略 */
        }
        finishDrag()
      }}
      onPointerCancel={() => finishDrag()}
      onClick={(e) => {
        /* 刚拖完的那一下不算点击，避免拖动结束误开卡片 */
        if (movedRef.current) {
          movedRef.current = false
          return
        }
        e.stopPropagation()
        onPick(s.id)
      }}
    >
      {/* 贴片本体（白边已烘进贴图；直接放入的则是原图整张） */}
      <mesh position={[0, worldH / 2 + 0.004, 0]}>
        <planeGeometry args={[worldW, worldH]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} side={THREE.DoubleSide} alphaTest={0.02} />
      </mesh>
      {/* 正下方承接面上的椭圆软影子（离得越高影子越淡） */}
      <mesh position={[0, shadowY - s.y + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[shadowR, 24]} />
        <meshBasicMaterial color="#6b5436" transparent opacity={shadowOp} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ---------- 天气特效（HTML 层，落在卡片虚化背景里） ---------- */
const RAIN_SLANT = 14 // 度：微微倾斜

function useParticles(count: number, seed: number) {
  return useMemo(() => {
    let s = seed || 1
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    return Array.from({ length: count }, () => ({
      x: rnd() * 104 - 2,
      len: 11 + rnd() * 17,
      dur: 0.48 + rnd() * 0.44,
      delay: -rnd() * 1.3,
      op: 0.3 + rnd() * 0.55,
      w: rnd() < 0.24 ? 2.1 : 1.4,
      size: 2.5 + rnd() * 3.5,
      sway: 8 + rnd() * 16,
      durS: 4.5 + rnd() * 4,
      delayS: -rnd() * 9,
    }))
  }, [count, seed])
}

function RainLayer({ count = 46, seed = 7 }: { count?: number; seed?: number }) {
  const drops = useParticles(count, seed)
  return (
    <div className="rain-layer" style={{ '--slnt': `${RAIN_SLANT}deg` } as React.CSSProperties} aria-hidden>
      {drops.map((d, i) => (
        <i
          key={i}
          style={
            {
              left: `${d.x}%`,
              width: d.w,
              height: d.len,
              '--op': d.op,
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

function SnowLayer({ count = 30, seed = 13 }: { count?: number; seed?: number }) {
  const flakes = useParticles(count, seed)
  return (
    <div className="snow-layer" aria-hidden>
      {flakes.map((d, i) => (
        <i
          key={i}
          style={
            {
              left: `${d.x}%`,
              width: d.size,
              height: d.size,
              '--op': d.op,
              '--sway': `${d.sway}px`,
              animationDuration: `${d.durS}s`,
              animationDelay: `${d.delayS}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

/* ---------- 上传后的三选一弹窗 ---------- */
function ChoiceModal({
  src,
  onAuto,
  onManual,
  onDirect,
  onClose,
}: {
  src: string
  onAuto: () => void
  onManual: () => void
  onDirect: () => void
  onClose: () => void
}) {
  return (
    <div className="mr3d-choice-mask" onClick={onClose}>
      <div className="mr3d-choice" onClick={(e) => e.stopPropagation()}>
        <button className="card-close" onClick={onClose}>
          ×
        </button>
        <h3>想把这张图怎么放进房间？</h3>
        <div className="choice-preview checker">
          <img src={src} alt="" />
        </div>
        <div className="choice-options">
          <button type="button" className="choice-item" onClick={onAuto}>
            <span className="choice-icon">✂️</span>
            <span className="choice-text">
              <b>自动扣图</b>
              <p>AI 沿物体边缘抠出主体，做成贴纸</p>
            </span>
          </button>
          <button type="button" className="choice-item" onClick={onManual}>
            <span className="choice-icon">✏️</span>
            <span className="choice-text">
              <b>手动截取</b>
              <p>在画布上自己圈出想保留的部分</p>
            </span>
          </button>
          <button type="button" className="choice-item" onClick={onDirect}>
            <span className="choice-icon">🖼️</span>
            <span className="choice-text">
              <b>直接放入</b>
              <p>原图整张放入，不做处理（和之前一样）</p>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- 手动截取编辑器：在图上圈一块，圈外变透明 ---------- */
function LassoEditor({
  src,
  onBack,
  onClose,
  onDone,
}: {
  src: string
  onBack: () => void
  onClose: () => void
  onDone: (cut: { dataUrl: string; width: number; height: number }) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const scaleRef = useRef(1)
  const drawingRef = useRef(false)
  const [poly, setPoly] = useState<{ x: number; y: number }[]>([])
  const [ready, setReady] = useState(false)
  const [working, setWorking] = useState(false)
  const [err, setErr] = useState('')

  /* 载入图片并按容器尺寸缩放画布 */
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const cv = canvasRef.current
      if (!cv) return
      const maxW = 460
      const maxH = 300
      const sc = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
      scaleRef.current = sc
      cv.width = Math.max(1, Math.round(img.naturalWidth * sc))
      cv.height = Math.max(1, Math.round(img.naturalHeight * sc))
      setReady(true)
    }
    img.onerror = () => setErr('图片无法解码，请换一张试试')
    img.src = src
  }, [src])

  const redraw = useCallback(() => {
    const cv = canvasRef.current
    const img = imgRef.current
    if (!cv || !img) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(img, 0, 0, cv.width, cv.height)
    if (poly.length >= 2) {
      /* 圈外压暗（evenodd 挖洞），圈内保持原图 */
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, cv.width, cv.height)
      poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.fillStyle = 'rgba(46, 32, 16, 0.45)'
      ctx.fill('evenodd')
      ctx.restore()
      /* 圈选线 */
      ctx.beginPath()
      poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.strokeStyle = '#fff8ea'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.stroke()
    }
  }, [poly])

  useEffect(() => {
    redraw()
  }, [redraw, ready])

  const toLocal = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e: React.PointerEvent) => {
    if (working) return
    e.preventDefault()
    drawingRef.current = true
    try {
      canvasRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* 忽略 */
    }
    setPoly([toLocal(e)])
  }
  const move = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    const p = toLocal(e)
    setPoly((prev) => {
      const last = prev[prev.length - 1]
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 3) return prev
      return [...prev, p]
    })
  }
  const up = (e: React.PointerEvent) => {
    drawingRef.current = false
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* 忽略 */
    }
  }

  const confirm = async () => {
    if (poly.length < 3 || working) return
    setWorking(true)
    setErr('')
    try {
      const nat = poly.map((p) => ({ x: p.x / scaleRef.current, y: p.y / scaleRef.current }))
      const cut = await cutWithLasso(src, nat)
      onDone(cut)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '截取失败，请重试')
      setWorking(false)
    }
  }

  return (
    <div className="crop-mask" onClick={onClose}>
      <div className="crop-panel" onClick={(e) => e.stopPropagation()}>
        <button className="card-close" onClick={onClose}>
          ×
        </button>
        <h3>手动截取：按住鼠标圈出想保留的部分</h3>
        <div className="crop-stage">
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
        {err && <p className="mr3d-err crop-err">{err}</p>}
        <div className="crop-actions">
          <button type="button" className="crop-back" onClick={onBack}>
            ← 返回
          </button>
          <p className="crop-hint">松开鼠标自动闭合圈选；重画可重新圈</p>
          <button type="button" className="crop-redo" onClick={() => setPoly([])} disabled={working}>
            重画
          </button>
          <button type="button" className="crop-ok" onClick={confirm} disabled={poly.length < 3 || working}>
            {working ? '截取中…' : '完成'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- 回忆卡片 ---------- */
function MemoryCard({
  sticker,
  weather,
  onWeather,
  onSave,
  onClose,
  onRemove,
}: {
  sticker: Sticker3D
  weather: string
  onWeather: (w: string) => void
  onSave: (meta: StickerMeta) => void
  onClose: () => void
  onRemove: () => void
}) {
  const m = sticker.meta || {}
  const [name, setName] = useState(m.name || '')
  const [date, setDate] = useState(m.date || '')
  const [text, setText] = useState(m.text || '')
  const [summary, setSummary] = useState(m.summary || '')

  /* 打开卡片时，把这件物品已保存的天气同步给窗外 */
  useEffect(() => {
    if (m.weather) onWeather(m.weather)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sticker.id])

  return (
    <div className="mr3d-card-mask" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>
      <div className="memory-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-tape" />
        <button className="card-close" onClick={onClose}>
          ×
        </button>

        {/* 便利贴后的虚化背景：同一张图放大模糊做底，天气特效叠在底与本体之间 */}
        <div className="card-photo checker">
          <img className="card-photo-blur" src={sticker.src} alt="" aria-hidden />
          {weather === 'rain' && <RainLayer count={46} />}
          {weather === 'snow' && <SnowLayer count={30} />}
          <img className="card-photo-main" src={sticker.src} alt="" />
        </div>

        <div className="card-body">
          <label className="card-row">
            <span>名字</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="这件物品叫什么" />
          </label>
          <label className="card-row">
            <span>日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="card-row">
            <span>天气</span>
            <div className="weather-pick">
              {WEATHERS.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  className={weather === w.key ? 'on' : ''}
                  onClick={() => onWeather(w.key)}
                  title={w.label}
                >
                  {w.icon}
                </button>
              ))}
            </div>
          </div>
          <label className="card-row">
            <span>回忆</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="写下和它有关的一段回忆……" />
          </label>

          {/* ===== SDK 嵌入位：语音记录（语音转文字 → 小总结） ===== */}
          <div className="sdk-slot" data-sdk="daily-voice-to-summary">
            <div className="sdk-placeholder">
              <span className="sdk-icon">🎙</span>
              <div>
                <b>语音记录</b>
                <p>说说今天发生了什么，SDK 会转成文字并生成小总结</p>
              </div>
            </div>
          </div>

          <label className="card-row">
            <span>小总结</span>
            <textarea
              className="summary-area"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="（由语音 SDK 自动生成，也可手动修改）"
            />
          </label>
        </div>

        <div className="card-actions">
          <button className="btn-ghost" onClick={onRemove}>
            丢掉它
          </button>
          <button className="btn-save" onClick={() => onSave({ name, date, weather, text, summary })}>
            收好这段回忆
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- 主组件 ---------- */
export default function MemoryRoom3D() {
  const [weather, setWeather] = useState('')
  const [stickers, setStickers] = useState<Sticker3D[]>(loadStickers)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [busy, setBusy] = useState(false) // 正在自动抠图
  const [prog, setProg] = useState<{ p: number; label: string } | null>(null)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<{ src: string; name: string } | null>(null) // 待选择的图片
  const [cropMode, setCropMode] = useState(false) // 三选一弹窗 → 手动截取编辑器
  const [draggingId, setDraggingId] = useState<string | null>(null) // 正在拖动的贴片

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stickers))
    } catch {
      /* 忽略容量错误 */
    }
  }, [stickers])

  const active = stickers.find((s) => s.id === activeId) || null

  /* 统一的新增贴片入口 */
  const addSticker = useCallback((src: string, img: { dataUrl: string; width: number; height: number }) => {
    setStickers((list) => [
      ...list,
      {
        id: `s${Date.now()}_${uid()}`,
        src,
        sticker: img.dataUrl,
        w: img.width,
        h: img.height,
        ...spawnPose(),
        meta: null,
      },
    ])
  }, [])

  /* 选择文件 → 读成 dataURL → 弹出三选一窗口 */
  const onFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files || [])[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    try {
      const src = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = () => reject(new Error('读取文件失败'))
        r.readAsDataURL(file)
      })
      setPending({ src, name: file.name })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '读取文件失败')
    }
  }, [])

  const closePending = useCallback(() => {
    setPending(null)
    setCropMode(false)
  }, [])

  /* 选项 ① 自动扣图（沿用之前的 AI 抠图 + 白边流程） */
  const runAuto = useCallback(async () => {
    if (!pending) return
    const src = pending.src
    closePending()
    setErr('')
    setBusy(true)
    setProg({ p: 0, label: '准备中…' })
    try {
      const cut = await stickerize(src, ({ phase, progress }) => {
        setProg(
          phase === 'loading'
            ? { p: (progress ?? 0) / 100, label: '加载抠图模型（首次会下载，之后有缓存）' }
            : { p: 1, label: '正在沿物体边缘抠图' }
        )
      })
      setProg({ p: 1, label: '生成贴合边缘的白边…' })
      const bordered = await addStickerBorder(cut.dataUrl)
      addSticker(src, bordered)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '抠图失败，请重试')
    } finally {
      setBusy(false)
      setProg(null)
    }
  }, [pending, closePending, addSticker])

  /* 选项 ② 手动截取：切到圈选编辑器 */
  const runManual = useCallback(() => {
    setCropMode(true)
  }, [])

  /* 选项 ③ 直接放入：原图整张放进去（和之前的直接放一样，只是压一下尺寸） */
  const runDirect = useCallback(async () => {
    if (!pending) return
    const src = pending.src
    closePending()
    setErr('')
    try {
      const flat = await flattenImage(src)
      addSticker(src, flat)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '放入失败，请重试')
    }
  }, [pending, closePending, addSticker])

  /* 手动截取完成 → 白边 → 新增贴片 */
  const onCropDone = useCallback(
    (cut: { dataUrl: string; width: number; height: number }) => {
      closePending()
      setErr('')
      addStickerBorder(cut.dataUrl)
        .then((bordered) => addSticker(cut.dataUrl, bordered))
        .catch(() => addSticker(cut.dataUrl, cut)) // 白边失败就用原图截取结果兜底
    },
    [closePending, addSticker]
  )

  const saveMeta = useCallback(
    (meta: StickerMeta) => {
      if (!activeId) return
      setStickers((list) => list.map((s) => (s.id === activeId ? { ...s, meta } : s)))
      setCardOpen(false)
      setActiveId(null)
    },
    [activeId]
  )

  const removeSticker = useCallback((id: string) => {
    setStickers((list) => list.filter((s) => s.id !== id))
    setCardOpen(false)
    setActiveId(null)
  }, [])

  const pick = useCallback((id: string) => {
    setActiveId(id)
    setCardOpen(true)
  }, [])

  return (
    <div className="mr3d-root">
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
        {stickers.map((s) => (
          <StickerPlane
            key={s.id}
            s={s}
            picked={cardOpen && activeId === s.id}
            onPick={pick}
            onDragActive={(on) => setDraggingId((cur) => (on ? s.id : cur === s.id ? null : cur))}
            onMove={(p) => setStickers((list) => list.map((x) => (x.id === s.id ? { ...x, ...p } : x)))}
          />
        ))}
        <CameraRig paused={!!draggingId} />
      </Canvas>

      {/* 上传按钮（单张，选完弹三选一） */}
      <label className="mr3d-upload">
        ＋ 放一件物品
        <input type="file" accept="image/*" hidden onChange={onFiles} />
      </label>

      {/* 操作提示 */}
      <p className="mr3d-hint">拖动贴图随意移动 · 按住 Shift 拖动可前后调整远近 · 点击贴图打开回忆</p>

      {/* 三选一弹窗 */}
      {pending && !cropMode && (
        <ChoiceModal src={pending.src} onAuto={runAuto} onManual={runManual} onDirect={runDirect} onClose={closePending} />
      )}

      {/* 手动截取编辑器 */}
      {pending && cropMode && (
        <LassoEditor src={pending.src} onBack={() => setCropMode(false)} onClose={closePending} onDone={onCropDone} />
      )}

      {/* 自动抠图进度 */}
      {busy && prog && (
        <div className="mr3d-progress-mask">
          <div className="mr3d-progress-panel">
            <h3>正在做成贴纸</h3>
            <div className="choice-progress">
              <i style={{ width: `${Math.round(prog.p * 100)}%` }} />
            </div>
            <p>
              {prog.label} {Math.round(prog.p * 100)}%
            </p>
            {err && <p className="mr3d-err">{err}</p>}
          </div>
        </div>
      )}
      {!busy && err && <p className="mr3d-err mr3d-err-float">{err}</p>}

      {/* 回忆卡片 */}
      {active && cardOpen && (
        <MemoryCard
          sticker={active}
          weather={weather}
          onWeather={setWeather}
          onSave={saveMeta}
          onClose={() => {
            setCardOpen(false)
            setActiveId(null)
          }}
          onRemove={() => removeSticker(active.id)}
        />
      )}
    </div>
  )
}
