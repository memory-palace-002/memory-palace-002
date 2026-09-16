/**
 * Room25D —— “小角落”房间 2.5D 伪 3D 版
 *
 * 相机：固定平视（正对房间正面），禁止旋转，只允许轻微左右平移 + 缩放
 * 风格：明亮低对比、清晰硬边阴影（basic shadow map）、颜色分区清晰
 * 材质：软（坐垫/帆布 哑光米白）× 硬（金属拉手/塑料灯罩），木纹（地板浅木、椅腿琥珀木棕）
 * 几何：全部 Box / Plane / Cylinder + RoundedBox（drei），零外部 GLB
 * 桌面大部分留空，作为物品摆放区（见文件底部注释的 MatchaCup 摆放说明）
 *
 * 依赖：npm install three @react-three/fiber @react-three/drei
 */
import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, RoundedBox } from '@react-three/drei'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

RectAreaLightUniformsLib.init()

/* ================= 相机配置（平视 2.5D） =================
 * position : [0, 1.35, 9]   与视目标同高 → 纯平视，无俯仰
 * fov      : 35             长焦小视角，透视收敛，接近 2.5D 插画的平面感
 * lookAt   : [0, 1.35, 0]   正对房间正面中轴
 * 交互     : 旋转锁定（azimuth/polar 都锁死），仅剩轻微左右平移 + 缩放
 * ======================================================== */
const CAM_POS = [0, 1.35, 9]
const CAM_FOV = 35
const CAM_Y = 1.35 // 平视高度（锁定）
const PAN_X = 1.2 // 左右平移范围 ±1.2

/* ================= 天气 =================
 * weather = 'sunny' | 'cloudy' | 'rain' | 'snow' | ''（未选 → WEATHER_DEFAULT）
 * sky      窗外天空渐变（上→下）
 * light    窗光颜色 / intensity 面光强度
 * ambient  室内环境光强度，dir 主光强度，tint 主光颜色
 */
const WEATHER = {
  sunny: { sky: ['#9fd0ef', '#dff0fb'], light: '#fff0d8', intensity: 3.2, ambient: 0.9, dir: 1.05, tint: '#fff4e2', cloud: 0.15 },
  cloudy: { sky: ['#c2ccd4', '#e6ecef'], light: '#e6ecf3', intensity: 1.7, ambient: 0.76, dir: 0.55, tint: '#eef2f6', cloud: 0.75 },
  rain: { sky: ['#6d7b88', '#aab7c1'], light: '#c2d2de', intensity: 0.95, ambient: 0.62, dir: 0.32, tint: '#d8e2e9', cloud: 1 },
  snow: { sky: ['#b9c7d1', '#eaf1f5'], light: '#e2edf4', intensity: 1.45, ambient: 0.8, dir: 0.5, tint: '#eaf1f6', cloud: 0.6 },
}
const WEATHER_DEFAULT = { sky: ['#bfe0f5', '#eef7fc'], light: '#ecf1fa', intensity: 2.2, ambient: 0.8, dir: 0.9, tint: '#fff4e6', cloud: 0.3 }

/* ---------- 配色 ---------- */
const WALL_OFFWHITE = '#f3eee4' // 米白墙
const CEILING_CREAM = '#f8f4ec'
const FURNITURE_CREAM = '#f4edde' // 家具米色
const SHELL_CANVAS = '#efe8da' // 椅子帆布米白
const GOLD_METAL = '#c8b28a' // 金属（拉手/灯杆）
const PLASTIC_CREAM = '#f2e7cf' // 塑料米黄
const STRIP_WARM = '#ffe3b0' // 灯带

/* ---------- 尺寸 ---------- */
const ROOM_W = 6
const ROOM_D = 6
const ROOM_H = 3
const BACK_Z = -ROOM_D / 2
const WIN_W = 2.6
const WIN_H = 1.8
const WIN_SILL = 1.0
export const DESK_TOP_Y = 1.0 // 桌面顶面高度（摆放物品用）
export const DESK_Z = BACK_Z + 0.55 // 桌面所在的 z
export const DESK_L = 3.0

/* ---------- 程序化贴图 ---------- */

// 木纹：可传基色。地板用浅木，椅腿/柜框用琥珀木棕
function createWoodTexture(base = [232, 209, 170], seam = 'rgba(120,95,60,0.35)') {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const ctx = c.getContext('2d')
  const rows = 8
  const rh = 512 / rows
  for (let r = 0; r < rows; r++) {
    const l = 0.92 + Math.random() * 0.14
    const rgb = base.map((v) => Math.min(255, Math.round(v * l)))
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
    ctx.fillRect(0, r * rh, 512, rh)
    for (let g = 0; g < 14; g++) {
      ctx.strokeStyle = `rgba(150,120,80,${0.04 + Math.random() * 0.05})`
      ctx.lineWidth = 1
      const y = r * rh + 4 + Math.random() * (rh - 8)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(170, y + (Math.random() * 6 - 3), 340, y + (Math.random() * 6 - 3), 512, y + (Math.random() * 4 - 2))
      ctx.stroke()
    }
    ctx.strokeStyle = seam
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, r * rh)
    ctx.lineTo(512, r * rh)
    ctx.stroke()
    const jx = (r % 2 ? 128 : 384) + Math.random() * 40
    ctx.beginPath()
    ctx.moveTo(jx, r * rh)
    ctx.lineTo(jx, r * rh + rh)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  return t
}

// 米色大理石（桌面，纹路很淡，保持 2.5D 的干净色块感）
function createMarbleTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f4ebe5'
  ctx.fillRect(0, 0, 512, 256)
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(216,186,178,${0.03 + Math.random() * 0.04})`
    ctx.beginPath()
    ctx.arc(Math.random() * 512, Math.random() * 256, 20 + Math.random() * 60, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(196,168,160,${0.07 + Math.random() * 0.08})`
    ctx.lineWidth = 0.6 + Math.random()
    ctx.beginPath()
    let x = Math.random() * 512
    let y = -10
    ctx.moveTo(x, y)
    while (y < 266) {
      y += 14 + Math.random() * 22
      x += (Math.random() - 0.5) * 36
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// 窗外天空：渐变 + 云团（cloudAmount 越大云越厚，雨天接近满云）
function createSkyTexture([top, bottom], cloudAmount) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const n = Math.round(cloudAmount * 14)
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 256
    const y = 30 + Math.random() * 120
    const r = 24 + Math.random() * 52
    const alpha = 0.05 + Math.random() * 0.12 * (0.4 + cloudAmount)
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, `rgba(255,255,255,${alpha})`)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ---------- 窗外降水：雨丝（倾斜 ≈14.6°）/ 飘雪 ---------- */
function Precipitation({ weather }) {
  const rainRef = useRef()
  const snowRef = useRef()
  const stateRef = useRef(null)

  const isRain = weather === 'rain'
  const isSnow = weather === 'snow'
  const count = isRain ? 380 : isSnow ? 240 : 0

  /* 降水区域：窗外一薄层（玻璃 BACK_Z-0.02，雨在更外侧、天空面 BACK_Z-1.6 之前） */
  const AREA = useMemo(
    () => ({
      x0: -WIN_W / 2 - 0.5,
      x1: WIN_W / 2 + 0.5,
      y0: WIN_SILL - 0.15,
      y1: WIN_SILL + WIN_H + 0.25,
      z0: BACK_Z - 1.5,
      z1: BACK_Z - 0.08,
      slant: 0.26, // 水平/垂直速度比 ≈ 14.6°：微微倾斜，不是垂直落地
      rainSpeed: 5.2, // 中小雨
      rainLen: 0.15,
      snowSpeed: 0.55,
    }),
    []
  )

  /* 粒子状态（位置 + 个体速度扰动 + 摆动相位） */
  if (!stateRef.current || stateRef.current.count !== count || stateRef.current.kind !== weather) {
    const s = { count, kind: weather, pos: null, phase: null, spd: null }
    if (count) {
      s.pos = new Float32Array(count * 3)
      s.phase = new Float32Array(count)
      s.spd = new Float32Array(count)
      for (let i = 0; i < count; i++) {
        s.pos[i * 3] = AREA.x0 + Math.random() * (AREA.x1 - AREA.x0)
        s.pos[i * 3 + 1] = AREA.y0 + Math.random() * (AREA.y1 - AREA.y0)
        s.pos[i * 3 + 2] = AREA.z0 + Math.random() * (AREA.z1 - AREA.z0)
        s.phase[i] = Math.random() * Math.PI * 2
        s.spd[i] = 0.8 + Math.random() * 0.45
      }
    }
    stateRef.current = s
  }

  /* 雨丝几何：每滴两个端点（头 + 尾）；雪花：点 */
  const rainPos = useMemo(() => (count ? new Float32Array(count * 6) : null), [count])
  const snowPos = useMemo(() => (count ? new Float32Array(count * 3) : null), [count])

  useFrame((_, dtRaw) => {
    if (!count) return
    const dt = Math.min(dtRaw, 0.05) // 切标签页回来不要瞬移
    const st = stateRef.current
    const A = AREA
    const t = performance.now() / 1000

    if (isRain) {
      const arr = rainRef.current?.geometry?.attributes?.position
      if (!arr) return
      const p = arr.array
      for (let i = 0; i < count; i++) {
        const ix = i * 3
        st.pos[ix + 1] -= A.rainSpeed * st.spd[i] * dt
        st.pos[ix] += A.rainSpeed * A.slant * st.spd[i] * dt
        if (st.pos[ix + 1] < A.y0) {
          st.pos[ix + 1] = A.y1
          st.pos[ix] = A.x0 + Math.random() * (A.x1 - A.x0)
        }
        if (st.pos[ix] > A.x1) st.pos[ix] = A.x0
        const hx = st.pos[ix]
        const hy = st.pos[ix + 1]
        const hz = st.pos[ix + 2]
        const o = i * 6
        p[o] = hx
        p[o + 1] = hy
        p[o + 2] = hz
        p[o + 3] = hx - A.rainLen * A.slant // 尾端沿倾斜方向的反向
        p[o + 4] = hy + A.rainLen
        p[o + 5] = hz
      }
      arr.needsUpdate = true
    } else if (isSnow) {
      const arr = snowRef.current?.geometry?.attributes?.position
      if (!arr) return
      const p = arr.array
      for (let i = 0; i < count; i++) {
        const ix = i * 3
        st.pos[ix + 1] -= A.snowSpeed * st.spd[i] * dt
        const sway = Math.sin(t * 0.9 + st.phase[i]) * 0.16 * dt
        st.pos[ix] += sway + A.snowSpeed * A.slant * 0.6 * st.spd[i] * dt
        if (st.pos[ix + 1] < A.y0) {
          st.pos[ix + 1] = A.y1
          st.pos[ix] = A.x0 + Math.random() * (A.x1 - A.x0)
        }
        if (st.pos[ix] > A.x1) st.pos[ix] = A.x0
        p[ix] = st.pos[ix]
        p[ix + 1] = st.pos[ix + 1]
        p[ix + 2] = st.pos[ix + 2]
      }
      arr.needsUpdate = true
    }
  })

  if (!count) return null
  if (isRain) {
    return (
      <lineSegments ref={rainRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count * 2} array={rainPos} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#dbe9f2" transparent opacity={0.55} depthWrite={false} />
      </lineSegments>
    )
  }
  return (
    <points ref={snowRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={snowPos} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.035} sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  )
}

/* ---------- 固定平视相机：锁旋转，允许轻微平移 + 缩放 ---------- */
function FixedCameraRig() {
  const controls = useRef()
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const c = controls.current
    if (!c) return
    // 只保留轻微左右平移；高度与朝向锁死，保证始终平视
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
      target={[0, CAM_Y, 0]}
      enableRotate={false} // 禁止旋转
      enableZoom // 允许缩放
      enablePan // 允许平移（上方 useFrame 限制为轻微左右）
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

/* ---------- 墙 / 地板 / 天花板 ---------- */
function Shell({ floorMap }) {
  const wall = <meshStandardMaterial color={WALL_OFFWHITE} roughness={1} />
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial map={floorMap} roughness={0.7} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM_H, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color={CEILING_CREAM} roughness={0.95} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-ROOM_W / 2, ROOM_H / 2, 0]}>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        {wall}
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[ROOM_W / 2, ROOM_H / 2, 0]}>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        {wall}
      </mesh>
    </group>
  )
}

/* ---------- 后墙 + 大窗 + 窗帘 + 窗光（正面 2.5D 主构图） ---------- */
function WindowWall({ skyMap, lightColor, lightIntensity }) {
  const t = 0.15
  const sideW = ROOM_W / 2 - WIN_W / 2
  const glassY = WIN_SILL + WIN_H / 2
  return (
    <group>
      {[
        [-(ROOM_W / 2 - sideW / 2), ROOM_H / 2, sideW, ROOM_H],
        [ROOM_W / 2 - sideW / 2, ROOM_H / 2, sideW, ROOM_H],
        [0, WIN_SILL / 2, WIN_W, WIN_SILL],
        [0, ROOM_H - (ROOM_H - WIN_SILL - WIN_H) / 2, WIN_W, ROOM_H - WIN_SILL - WIN_H],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, BACK_Z]} receiveShadow>
          <boxGeometry args={[w, h, t]} />
          <meshStandardMaterial color={WALL_OFFWHITE} roughness={1} />
        </mesh>
      ))}
      {/* 窗外天空（按天气换贴图，在玻璃外侧） */}
      <mesh position={[0, WIN_SILL + WIN_H / 2, BACK_Z - 1.6]}>
        <planeGeometry args={[WIN_W + 1.4, WIN_H + 1.2]} />
        <meshBasicMaterial map={skyMap} toneMapped={false} />
      </mesh>
      {/* 玻璃 */}
      <mesh position={[0, glassY, BACK_Z - 0.02]}>
        <planeGeometry args={[WIN_W, WIN_H]} />
        <meshStandardMaterial color="#e9f0f6" transparent opacity={0.3} roughness={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* 一片半透白窗帘 */}
      <mesh position={[0, glassY + 0.05, BACK_Z + 0.25]} rotation={[0, 0.03, 0]}>
        <planeGeometry args={[WIN_W + 0.3, WIN_H + 0.3]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.42} roughness={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* 窗光面光源（颜色/强度随天气变化） */}
      <rectAreaLight args={[lightColor, lightIntensity, WIN_W, WIN_H]} position={[0, glassY, BACK_Z + 0.35]} rotation={[0, Math.PI, 0]} />
      {/* 天花板灯槽灯带（自发光，轻） */}
      <mesh position={[0, ROOM_H - 0.08, BACK_Z + 0.12]}>
        <boxGeometry args={[ROOM_W - 0.4, 0.035, 0.035]} />
        <meshStandardMaterial color={STRIP_WARM} emissive="#ffdfae" emissiveIntensity={0.9} />
      </mesh>
    </group>
  )
}

/* ---------- 长桌：米色柜体 + 大理石桌面，左抽屉柱 + 右抽屉，中部留空 ---------- */
function Desk({ marbleMap }) {
  const kneeL = -0.42 // 桌下留空区左界
  const kneeR = 0.42 // 桌下留空区右界（椅子位置）
  const drawerYs = [0.24, 0.5, 0.76]
  const knob = (
    <meshStandardMaterial color={GOLD_METAL} roughness={0.35} metalness={0.6} />
  )
  return (
    <group>
      {/* 桌面 */}
      <mesh position={[0, DESK_TOP_Y - 0.03, DESK_Z]} castShadow receiveShadow>
        <boxGeometry args={[DESK_L, 0.06, 0.62]} />
        <meshPhysicalMaterial map={marbleMap} roughness={0.4} clearcoat={0.35} clearcoatRoughness={0.35} />
      </mesh>
      {/* 左抽屉柱 */}
      <mesh position={[-DESK_L / 2 + 0.25, 0.5, DESK_Z]} castShadow>
        <boxGeometry args={[0.46, 0.94, 0.56]} />
        <meshStandardMaterial color={FURNITURE_CREAM} roughness={0.85} />
      </mesh>
      {drawerYs.map((y) => (
        <group key={`l${y}`}>
          <mesh position={[-DESK_L / 2 + 0.25, y, DESK_Z + 0.29]}>
            <boxGeometry args={[0.4, 0.2, 0.025]} />
            <meshStandardMaterial color="#f7f1e4" roughness={0.85} />
          </mesh>
          <mesh position={[-DESK_L / 2 + 0.25, y, DESK_Z + 0.315]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.018, 12]} />
            {knob}
          </mesh>
        </group>
      ))}
      {/* 右抽屉柜 */}
      <mesh position={[DESK_L / 2 - 0.5, 0.5, DESK_Z]} castShadow>
        <boxGeometry args={[0.85, 0.94, 0.56]} />
        <meshStandardMaterial color={FURNITURE_CREAM} roughness={0.85} />
      </mesh>
      {[0.32, 0.66].map((y) => (
        <group key={`r${y}`}>
          <mesh position={[DESK_L / 2 - 0.5, y, DESK_Z + 0.29]}>
            <boxGeometry args={[0.75, 0.26, 0.025]} />
            <meshStandardMaterial color="#f7f1e4" roughness={0.85} />
          </mesh>
          <mesh position={[DESK_L / 2 - 0.5, y, DESK_Z + 0.315]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.018, 12]} />
            {knob}
          </mesh>
        </group>
      ))}
      {/* 桌面小台灯（最左端，其余桌面留白作为摆放区） */}
      <group position={[-DESK_L / 2 + 0.2, DESK_TOP_Y, DESK_Z - 0.16]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.075, 0.085, 0.02, 20]} />
          <meshStandardMaterial color={PLASTIC_CREAM} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.14, 0]} rotation={[0.08, 0, 0.1]}>
          <cylinderGeometry args={[0.011, 0.011, 0.26, 8]} />
          <meshStandardMaterial color={GOLD_METAL} roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0.018, 0.28, 0]} rotation={[0, 0, -0.32]}>
          <cylinderGeometry args={[0.05, 0.075, 0.09, 18, 1, true]} />
          <meshStandardMaterial color={PLASTIC_CREAM} emissive="#ffe2ae" emissiveIntensity={0.7} roughness={0.55} side={THREE.DoubleSide} />
        </mesh>
        <pointLight position={[0.025, 0.24, 0]} color="#ffc98a" intensity={1.8} distance={1.8} decay={1.8} />
      </group>
    </group>
  )
}

/* ---------- 帆布壳椅：米白圆角壳体 + 琥珀木腿（参考 clipboard 图） ---------- */
function Chair({ woodMap }) {
  const legData = [
    [-0.19, -0.16, 0.09, -0.07],
    [0.19, -0.16, -0.09, -0.07],
    [-0.19, 0.16, 0.09, 0.07],
    [0.19, 0.16, -0.09, 0.07],
  ]
  return (
    <group position={[0, 0, BACK_Z + 1.75]}>
      {/* 坐垫壳（软：哑光帆布质感） */}
      <RoundedBox args={[0.5, 0.08, 0.46]} radius={0.035} smoothness={4} position={[0, 0.44, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={SHELL_CANVAS} roughness={0.95} />
      </RoundedBox>
      {/* 靠背壳（圆角、微微后仰） */}
      <RoundedBox args={[0.5, 0.44, 0.06]} radius={0.03} smoothness={4} position={[0, 0.68, 0.2]} rotation={[-0.12, 0, 0]} castShadow>
        <meshStandardMaterial color={SHELL_CANVAS} roughness={0.95} />
      </RoundedBox>
      {/* 四条外撇琥珀木腿（硬：木质） */}
      {legData.map(([x, z, rz, rx], i) => (
        <mesh key={i} position={[x, 0.21, z]} rotation={[rx, 0, rz]} castShadow>
          <cylinderGeometry args={[0.015, 0.02, 0.42, 10]} />
          <meshStandardMaterial map={woodMap} roughness={0.55} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- 右侧书柜：米色柜体 + 暖光灯带 + 彩色薄书 ---------- */
function Bookshelf({ woodMap }) {
  const W = 1.15
  const H = 2.55
  const D = 0.3
  const cx = ROOM_W / 2 - W / 2 - 0.35
  const shelfYs = [0.55, 1.05, 1.55, 2.05]
  const books = [
    [-0.42, 0.55], [-0.34, 0.6], [-0.22, 0.55], [0.1, 1.05], [0.2, 0.62],
  ]
  const bookColors = ['#e8c8c8', '#c8d8c0', '#d8c8e8', '#f0e0c0', '#c0d0e0']
  return (
    <group position={[cx, 0, BACK_Z + D / 2 + 0.03]}>
      {/* 背板 / 顶底 / 侧板 */}
      <mesh position={[0, H / 2, -D / 2 + 0.015]} receiveShadow>
        <boxGeometry args={[W, H, 0.03]} />
        <meshStandardMaterial color="#ece4d2" roughness={0.9} />
      </mesh>
      <mesh position={[0, H, 0]} castShadow>
        <boxGeometry args={[W + 0.06, 0.05, D]} />
        <meshStandardMaterial color={FURNITURE_CREAM} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[W + 0.06, 0.06, D]} />
        <meshStandardMaterial color={FURNITURE_CREAM} roughness={0.85} />
      </mesh>
      {[-W / 2, W / 2].map((x) => (
        <mesh key={x} position={[x, H / 2, 0]} castShadow>
          <boxGeometry args={[0.05, H, D]} />
          <meshStandardMaterial color={FURNITURE_CREAM} roughness={0.85} />
        </mesh>
      ))}
      {/* 层板 + 灯带 + 书 */}
      {shelfYs.map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[W - 0.06, 0.035, D - 0.04]} />
            <meshStandardMaterial color={FURNITURE_CREAM} roughness={0.85} />
          </mesh>
          <mesh position={[0, y - 0.024, D / 2 - 0.08]}>
            <boxGeometry args={[W - 0.2, 0.012, 0.02]} />
            <meshStandardMaterial color={STRIP_WARM} emissive="#ffd9a0" emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
      {books.map(([x, y], i) => (
        <mesh key={i} position={[x, y + 0.1, 0.02]} rotation={[0, 0, i % 2 ? 0.08 : 0]} castShadow>
          <boxGeometry args={[0.05, 0.22, 0.16]} />
          <meshStandardMaterial color={bookColors[i % bookColors.length]} roughness={0.85} />
        </mesh>
      ))}
      <pointLight position={[0, 1.6, 0.1]} color="#ffd9a0" intensity={1.2} distance={1.6} decay={1.6} />
      {/* 底部抽屉 */}
      {[0.14, 0.36].map((y) => (
        <group key={`d${y}`}>
          <mesh position={[0, y, D / 2 - 0.005]}>
            <boxGeometry args={[W - 0.1, 0.18, 0.02]} />
            <meshStandardMaterial color="#f7f1e4" roughness={0.85} />
          </mesh>
          <mesh position={[0, y, D / 2 + 0.012]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.016, 12]} />
            <meshStandardMaterial color={GOLD_METAL} roughness={0.35} metalness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ---------- 顶灯（柔光） ---------- */
function CeilingLamp() {
  return (
    <group position={[0, ROOM_H - 0.15, -0.4]}>
      <mesh>
        <cylinderGeometry args={[0.26, 0.32, 0.1, 28]} />
        <meshStandardMaterial color="#fbf6ec" emissive="#ffedc8" emissiveIntensity={0.4} roughness={0.5} />
      </mesh>
      <pointLight color="#ffe4bd" intensity={5} distance={8} decay={1.8} />
    </group>
  )
}

/* ---------- 房间整体（weather: 'sunny'|'cloudy'|'rain'|'snow'|''） ---------- */
export function Room25DModel({ weather = '', ...props }) {
  const floorMap = useMemo(() => createWoodTexture([234, 214, 178]), [])
  const amberMap = useMemo(() => createWoodTexture([196, 152, 96], 'rgba(110,80,45,0.4)'), [])
  const marbleMap = useMemo(createMarbleTexture, [])
  const W = WEATHER[weather] || WEATHER_DEFAULT
  const skyMap = useMemo(() => createSkyTexture(W.sky, W.cloud), [W])
  return (
    <group {...props}>
      <Shell floorMap={floorMap} />
      <WindowWall skyMap={skyMap} lightColor={W.light} lightIntensity={W.intensity} />
      <Precipitation weather={weather} />
      <Desk marbleMap={marbleMap} />
      <Chair woodMap={amberMap} />
      <Bookshelf woodMap={amberMap} />
      <CeilingLamp />
    </group>
  )
}

/* ---------- 场景 ---------- */
export default function Room25DScene({ weather = '' }) {
  const W = WEATHER[weather] || WEATHER_DEFAULT
  return (
    <Canvas
      shadows="basic" /* 硬边阴影，接近手绘插画的清晰阴影 */
      camera={{ position: CAM_POS, fov: CAM_FOV }}
      style={{ width: '100%', height: '100vh' }}
      gl={{ toneMappingExposure: 1.0 }}
    >
      <color attach="background" args={['#f4efe6']} />
      {/* 环境光/主光随天气变化：雨天整体压暗偏冷，晴天暖亮 */}
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
      <Room25DModel weather={weather} />
      <FixedCameraRig />
    </Canvas>
  )
}

/* ================= MatchaCup 摆放说明 =================
 * 桌面顶面高度 = DESK_TOP_Y = 1.0，桌面 z = DESK_Z = -2.45
 * MatchaCup 模型以杯身中心为原点（半高 = 1.6 × scale）
 *
 * 直接放进本场景（Room25DModel 内）：
 *   import MatchaCup from '../item/MatchaCup'
 *   <MatchaCup position={[0.5, DESK_TOP_Y + 1.6 * 0.085, DESK_Z]} scale={0.085} />
 *   → 杯高约 0.27，稳稳落在桌面右侧留空区，台灯在左、杯子在右
 *
 * 放进 my-3d-project（ItemModel 已把杯子归一化到 0.35 高）：
 *   杯子半高 = 0.175，mockData.ts 里改：
 *   transform: { position: [0.5, 1.0 + 0.175, DESK_Z], rotation: [0, 0, 0], scale: 1 }
 *   即 position: [0.5, 1.175, -2.45]
 * ======================================================= */
