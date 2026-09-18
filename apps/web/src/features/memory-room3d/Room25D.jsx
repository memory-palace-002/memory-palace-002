/**
 * Room25D —— “小角落”房间 2.5D 伪 3D 版
 *
 * 相机：固定平视（正对房间正面），禁止旋转，只允许轻微左右平移 + 缩放
 * 风格：明亮低对比、软阴影（PCFSoft）、颜色分区清晰
 * 材质：奶油白墙 × 深红棕亮面木地板（clearcoat）× 胡桃木收边/书柜/相框（参考微缩房间摄影）
 * 几何：全部 Box / Plane / Cylinder + RoundedBox（drei），零外部 GLB
 * 桌面大部分留空，作为物品摆放区（见文件底部注释的 MatchaCup 摆放说明）
 *
 * 依赖：npm install three @react-three/fiber @react-three/drei
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, RoundedBox } from '@react-three/drei'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

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
  // 晴天：整体调亮，sun=1 时窗外画太阳、窗边出现阳光光柱与地板光斑
  sunny: { sky: ['#8fc7f0', '#e2f3fc'], light: '#ffedd0', intensity: 4.0, ambient: 1.02, dir: 1.35, tint: '#fff3da', cloud: 0.08, sun: 1 },
  // 阴天：压暗——天空更灰、窗光/环境光/主光都再降一档
  cloudy: { sky: ['#96a3ae', '#ccd6dc'], light: '#dfe6ec', intensity: 1.15, ambient: 0.58, dir: 0.38, tint: '#e3e9ee', cloud: 0.95 },
  rain: { sky: ['#6d7b88', '#aab7c1'], light: '#c2d2de', intensity: 0.95, ambient: 0.62, dir: 0.32, tint: '#d8e2e9', cloud: 1 },
  snow: { sky: ['#b9c7d1', '#eaf1f5'], light: '#e2edf4', intensity: 1.45, ambient: 0.8, dir: 0.5, tint: '#eaf1f6', cloud: 0.6 },
}
const WEATHER_DEFAULT = { sky: ['#bfe0f5', '#eef7fc'], light: '#ecf1fa', intensity: 2.2, ambient: 0.8, dir: 0.9, tint: '#fff4e6', cloud: 0.3 }

/* ---------- 配色（参考微缩房间摄影：奶油白墙 + 深红棕亮面地板 + 胡桃木收边） ---------- */
const WALL_OFFWHITE = '#f7f3ea' // 奶油白墙
const CEILING_CREAM = '#faf7f0'
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

/* 书桌右侧抽屉柜「最上面一格」——可拉出的那一格。
 * ⚠️ 必须保持导出：RoomBackground.tsx 会 import 它来推导抽屉俯视镜头，
 *    删掉这个 export 会让房间页面直接报错。
 *    抽屉面板、柜内背板（PullOutDrawer 内部）与抽屉俯视镜头共用这一组数值，
 *    改这里抽屉本体和镜头会自动同步。 */
export const DESK_DRAWER = {
  x: DESK_L / 2 - 0.5, // 抽屉中心 x = 1.0
  y: 0.66, // 抽屉中心高度（柜体上那两格的上格）
  z: DESK_Z + 0.29, // 关闭时面板所在的 z = -2.16
  w: 0.75,
  h: 0.26,
  travel: 0.34, // 完全拉出时向前移动的距离
}

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

// 红白格纹（圆毯，参考图的红白 gingham 圆毯；纯贴图，不加建模）
function createGinghamTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f5eee1'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = 'rgba(198,86,66,0.8)'
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 64, 0, 32, 256)
    ctx.fillRect(0, i * 64, 256, 32)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(4, 4)
  t.anisotropy = 4
  return t
}

// 皮革：细密颗粒 + 浅折痕；返回 { map, bump }（用同一套噪点画两遍：彩色版做贴图、灰度版做凹凸）
function createLeatherTextures() {
  const SIZE = 256
  const paint = (ctx, base, dark, light) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, SIZE, SIZE)
    /* 皮革颗粒（颗粒做粗一点，相机在 9 米外才看得见皮纹） */
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * SIZE
      const y = Math.random() * SIZE
      const r = 1.2 + Math.random() * 2.6
      ctx.fillStyle = Math.random() < 0.5 ? light : dark
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    /* 浅浅的折痕（长波浪线，让皮面有使用感） */
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = dark
      ctx.lineWidth = 1.2 + Math.random() * 2
      ctx.beginPath()
      let x = Math.random() * SIZE
      let y = Math.random() * SIZE
      ctx.moveTo(x, y)
      const seg = 5 + Math.floor(Math.random() * 6)
      for (let s = 0; s < seg; s++) {
        x += (Math.random() - 0.5) * 46
        y += (Math.random() - 0.5) * 46
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  const mk = (mode) => {
    const c = document.createElement('canvas')
    c.width = c.height = SIZE
    const ctx = c.getContext('2d')
    if (mode === 'color') paint(ctx, '#cfcfcf', 'rgba(0,0,0,0.12)', 'rgba(255,255,255,0.13)')
    else paint(ctx, '#808080', 'rgba(0,0,0,0.6)', 'rgba(255,255,255,0.6)')
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = mode === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1.6, 1.6)
    t.anisotropy = 4
    return t
  }
  return { map: mk('color'), bump: mk('bump') }
}

// 短绒 / 毛绒：极密的明暗点 + 短纤维，配 roughness=1 出绒面哑光感
function createPlushTexture() {
  const SIZE = 256
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#efefef'
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 3600; i++) {
    const x = Math.random() * SIZE
    const y = Math.random() * SIZE
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.13)'
    ctx.beginPath()
    ctx.arc(x, y, 1 + Math.random() * 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
  /* 绒毛短纤维 */
  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * SIZE
    const y = Math.random() * SIZE
    const a = Math.random() * Math.PI * 2
    const l = 2.5 + Math.random() * 4
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)'
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 3)
  t.anisotropy = 4
  return t
}

// 窗外天空：渐变 + 簇状云团（cloudAmount 越大云越厚，雨天接近满云）
// sun=true 时画太阳：亮核 + 多层光晕 + 放射光芒（晴天专属）
function createSkyTexture([top, bottom], cloudAmount, sun = false) {
  const S = 512
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)

  /* 太阳：位置在画面上方偏右，避开窗户正中的云 */
  if (sun) {
    const sx = S * 0.7
    const sy = S * 0.22
    // 大范围暖光晕（两层）
    let rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, S * 0.34)
    rg.addColorStop(0, 'rgba(255,240,200,0.55)')
    rg.addColorStop(1, 'rgba(255,240,200,0)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(sx, sy, S * 0.34, 0, Math.PI * 2)
    ctx.fill()
    rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, S * 0.16)
    rg.addColorStop(0, 'rgba(255,249,230,0.95)')
    rg.addColorStop(1, 'rgba(255,249,230,0)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(sx, sy, S * 0.16, 0, Math.PI * 2)
    ctx.fill()
    // 放射光芒（细长渐变条，绕太阳一圈）
    ctx.save()
    ctx.translate(sx, sy)
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12)
      const len = S * (0.13 + Math.random() * 0.07)
      const ray = ctx.createLinearGradient(0, 0, 0, -len)
      ray.addColorStop(0, 'rgba(255,246,215,0.5)')
      ray.addColorStop(1, 'rgba(255,246,215,0)')
      ctx.fillStyle = ray
      ctx.beginPath()
      ctx.moveTo(-S * 0.012, 0)
      ctx.lineTo(S * 0.012, 0)
      ctx.lineTo(0, -len)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    // 亮核
    ctx.fillStyle = 'rgba(255,255,252,0.98)'
    ctx.beginPath()
    ctx.arc(sx, sy, S * 0.045, 0, Math.PI * 2)
    ctx.fill()
  }

  /* 簇状云：一朵云由 3~6 个径向渐变圆叠成（底部略平，更接近真实云形） */
  const n = Math.round(cloudAmount * 9)
  for (let i = 0; i < n; i++) {
    const cx = Math.random() * S
    const cy = S * 0.08 + Math.random() * S * 0.34
    const scale = 0.5 + Math.random() * 0.9
    const puffs = 3 + Math.floor(Math.random() * 4)
    const base = 0.1 + Math.random() * 0.1 * (0.4 + cloudAmount)
    for (let p = 0; p < puffs; p++) {
      const px = cx + (p - puffs / 2) * 30 * scale + (Math.random() * 18 - 9)
      const py = cy + Math.random() * 22 * scale - 8
      const r = (34 + Math.random() * 30) * scale
      const rg = ctx.createRadialGradient(px, py, 0, px, py, r)
      rg.addColorStop(0, `rgba(255,255,255,${base})`)
      rg.addColorStop(0.7, `rgba(255,255,255,${base * 0.55})`)
      rg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ---------- 柔和圆点贴图（雪花） / 光柱渐变 / 地板光斑（晴天阳光） ---------- */
function createSoftDotTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function createShaftTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, 'rgba(255,255,255,0.9)') // 窗口端最亮
  g.addColorStop(0.55, 'rgba(255,255,255,0.38)')
  g.addColorStop(1, 'rgba(255,255,255,0)') // 地板端淡出
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 256)
  // 左右两边也柔化，避免光柱出现硬边
  const gx = ctx.createLinearGradient(0, 0, 64, 0)
  gx.addColorStop(0, 'rgba(0,0,0,1)')
  gx.addColorStop(0.25, 'rgba(0,0,0,0)')
  gx.addColorStop(0.75, 'rgba(0,0,0,0)')
  gx.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = gx
  ctx.fillRect(0, 0, 64, 256)
  ctx.globalCompositeOperation = 'source-over'
  return new THREE.CanvasTexture(c)
}

function createPoolTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 126)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

/* ---------- 雪花单层：同层颗粒大小/速度/摆幅一致，多层叠加出远近景深 ---------- */
function SnowLayer({ area, count, size, speed, swayF, swayA, opacity, tex }) {
  const ref = useRef()
  const state = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const phase = new Float32Array(count)
    const spd = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = area.x0 + Math.random() * (area.x1 - area.x0)
      pos[i * 3 + 1] = area.y0 + Math.random() * (area.y1 - area.y0)
      pos[i * 3 + 2] = area.z0 + Math.random() * (area.z1 - area.z0)
      phase[i] = Math.random() * Math.PI * 2
      spd[i] = 0.85 + Math.random() * 0.35
    }
    return { pos, phase, spd }
  }, [count, area])
  const posArr = useMemo(() => new Float32Array(count * 3), [count])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05) // 切标签页回来不要瞬移
    const arr = ref.current?.geometry?.attributes?.position
    if (!arr) return
    const p = arr.array
    const t = performance.now() / 1000
    for (let i = 0; i < count; i++) {
      const ix = i * 3
      state.pos[ix + 1] -= speed * state.spd[i] * dt
      // 水平摆动（sin 相位错开）+ 微微前后漂移，让雪“飘”起来
      state.pos[ix] += Math.sin(t * swayF + state.phase[i]) * swayA * dt + speed * 0.12 * state.spd[i] * dt
      state.pos[ix + 2] += Math.cos(t * 0.6 + state.phase[i]) * 0.045 * dt
      if (state.pos[ix + 1] < area.y0) {
        state.pos[ix + 1] = area.y1
        state.pos[ix] = area.x0 + Math.random() * (area.x1 - area.x0)
      }
      if (state.pos[ix] > area.x1) state.pos[ix] = area.x0
      p[ix] = state.pos[ix]
      p[ix + 1] = state.pos[ix + 1]
      p[ix + 2] = state.pos[ix + 2]
    }
    arr.needsUpdate = true
  })

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={posArr} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={tex} color="#ffffff" size={size} sizeAttenuation transparent opacity={opacity} depthWrite={false} />
    </points>
  )
}

/* ---------- 窗外降水：雨丝（倾斜 ≈14.6°）/ 三层雪花（小·中·大） ---------- */
function Precipitation({ weather }) {
  const rainRef = useRef()
  const stateRef = useRef(null)

  const isRain = weather === 'rain'
  const isSnow = weather === 'snow'
  const count = isRain ? 400 : 0
  const dotTex = useMemo(createSoftDotTexture, [])

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
    }),
    []
  )

  /* 雨丝粒子状态 */
  if (isRain && (!stateRef.current || stateRef.current.count !== count)) {
    const s = { count, pos: new Float32Array(count * 3), phase: null, spd: new Float32Array(count) }
    for (let i = 0; i < count; i++) {
      s.pos[i * 3] = AREA.x0 + Math.random() * (AREA.x1 - AREA.x0)
      s.pos[i * 3 + 1] = AREA.y0 + Math.random() * (AREA.y1 - AREA.y0)
      s.pos[i * 3 + 2] = AREA.z0 + Math.random() * (AREA.z1 - AREA.z0)
      s.spd[i] = 0.8 + Math.random() * 0.45
    }
    stateRef.current = s
  }
  const rainPos = useMemo(() => (count ? new Float32Array(count * 6) : null), [count])

  useFrame((_, dtRaw) => {
    if (!isRain || !count) return
    const dt = Math.min(dtRaw, 0.05)
    const st = stateRef.current
    const A = AREA
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
  })

  if (isRain) {
    return (
      <lineSegments ref={rainRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count * 2} array={rainPos} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#d5e6f2" transparent opacity={0.5} depthWrite={false} />
      </lineSegments>
    )
  }
  if (isSnow) {
    /* 三层：远处小雪密而慢 → 近处大雪疏而快，飘落有景深 */
    return (
      <group>
        <SnowLayer area={AREA} tex={dotTex} count={140} size={0.02} speed={0.42} swayF={1.15} swayA={0.2} opacity={0.7} />
        <SnowLayer area={AREA} tex={dotTex} count={80} size={0.042} speed={0.68} swayF={0.8} swayA={0.3} opacity={0.85} />
        <SnowLayer area={AREA} tex={dotTex} count={34} size={0.075} speed={0.98} swayF={0.55} swayA={0.45} opacity={0.95} />
      </group>
    )
  }
  return null
}

/* ---------- 晴天专属：窗边阳光（斜射光柱 + 地板/桌面暖光斑，带轻微呼吸感） ---------- */
function Sunlight({ weather }) {
  const isSunny = weather === 'sunny'
  const shaftTex = useMemo(createShaftTexture, [])
  const poolTex = useMemo(createPoolTexture, [])
  const wideRef = useRef()

  useFrame(({ clock }) => {
    // 光柱透明度轻微起伏，像窗外云慢慢飘过的感觉
    const m = wideRef.current
    if (m) m.material.opacity = 0.16 + Math.sin(clock.elapsedTime * 0.6) * 0.035
  })

  if (!isSunny) return null
  return (
    <group>
      {/* 宽光柱：从窗口上方斜插到地板（rotation.x = -0.55 顶端贴窗沿） */}
      <mesh ref={wideRef} position={[0.35, 1.32, -2.0]} rotation={[-0.55, 0, 0.06]}>
        <planeGeometry args={[1.9, 3.1]} />
        <meshBasicMaterial
          map={shaftTex}
          color="#ffe9bf"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* 窄亮光柱（第二道，角度略不同，层次感） */}
      <mesh position={[-0.45, 1.35, -2.05]} rotation={[-0.55, 0, -0.05]}>
        <planeGeometry args={[0.55, 3.0]} />
        <meshBasicMaterial
          map={shaftTex}
          color="#fff3d6"
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* 地板光斑（窗前地板上的一片暖阳） */}
      <mesh position={[0.45, 0.015, -1.4]} rotation={[-Math.PI / 2, 0, 0.12]}>
        <planeGeometry args={[2.4, 1.75]} />
        <meshBasicMaterial
          map={poolTex}
          color="#ffe7b8"
          transparent
          opacity={0.38}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* 桌面右侧的一小片暖光 */}
      <mesh position={[0.45, DESK_TOP_Y + 0.035, DESK_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.7, 0.55]} />
        <meshBasicMaterial
          map={poolTex}
          color="#ffe7b8"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/* ---------- 四季（用户需求：左上角悬浮切换，窗外贴图 + 光线明暗联动） ----------
 * url    : 窗外照片（public/seasons/，由用户提供的四季参考图重绘成与房间一致的柔和插画质感）
 * light/intensity: 窗光颜色与强度（rectAreaLight）
 * ambient/ambientColor/dir: 全局环境光强度/颜色 + 主光强度
 * bg     : 画布底色（房间外的空隙），随季节微调氛围
 * 光影差异刻意拉大：春夏明亮（夏最烈）、秋暖橙、冬冷蓝昏暗 */
export const SEASON_OPTIONS = [
  { id: 'spring', label: '春', url: '/seasons/spring.png', light: '#e8ffd2', intensity: 2.1, ambient: 1.0, ambientColor: '#f0ffe0', dir: 1.3, bg: '#f2f4e3' },
  { id: 'summer', label: '夏', url: '/seasons/summer.png', light: '#fff8d8', intensity: 2.9, ambient: 1.15, ambientColor: '#fff3cf', dir: 1.8, bg: '#f6f1dd' },
  { id: 'autumn', label: '秋', url: '/seasons/autumn.png', light: '#ffc06e', intensity: 1.8, ambient: 0.72, ambientColor: '#ffdba6', dir: 0.95, bg: '#f4e4c8' },
  { id: 'winter', label: '冬', url: '/seasons/winter.png', light: '#a9c8ee', intensity: 1.0, ambient: 0.45, ambientColor: '#d5e4f6', dir: 0.3, bg: '#e4ecf5' },
]
const SEASON_MAP = Object.fromEntries(SEASON_OPTIONS.map((s) => [s.id, s]))

/* 窗外四季照片贴图；未选季节或未加载完成时返回 null（回退到程序化天空，不阻塞场景） */
function useSeasonTexture(season) {
  const [tex, setTex] = useState(null)
  useEffect(() => {
    if (!season || !SEASON_MAP[season]) {
      setTex(null)
      return
    }
    let alive = true
    new THREE.TextureLoader().load(SEASON_MAP[season].url, (t) => {
      if (!alive) {
        t.dispose()
        return
      }
      t.colorSpace = THREE.SRGBColorSpace
      /* 窗外幕布是 (WIN_W+1.4)×(WIN_H+1.2) 的面片，照片接近正方形：
       * 按图片真实宽高比裁剪 UV（居中取景），避免把方图拉成宽图 */
      const img = t.image
      const planeAspect = (WIN_W + 1.4) / (WIN_H + 1.2)
      const imgAspect = img && img.width && img.height ? img.width / img.height : 1
      if (imgAspect > planeAspect) {
        t.repeat.set(planeAspect / imgAspect, 1)
        t.offset.set((1 - planeAspect / imgAspect) / 2, 0)
      } else if (imgAspect < planeAspect) {
        t.repeat.set(1, imgAspect / planeAspect)
        t.offset.set(0, (1 - imgAspect / planeAspect) / 2)
      }
      setTex(t)
    })
    return () => {
      alive = false
    }
  }, [season])
  return tex
}

/* 照片墙里的图片（dataURL 数组）→ THREE 贴图数组，按顺序一一对应。
 * 依赖用数组「引用」而不是内容拼接（dataURL 很长，拼串会有上 MB 的额外开销），
 * 所以调用方要传稳定引用（RoomBackground 存在 state 里；默认值用模块级常量）。 */
const NO_FRAME_PHOTOS = []
function usePhotoTextures(urls = NO_FRAME_PHOTOS) {
  const [texs, setTexs] = useState([])
  useEffect(() => {
    if (!urls.length) {
      setTexs((cur) => (cur.length ? [] : cur)) // 值没变时跳过重渲染
      return
    }
    let alive = true
    const loader = new THREE.TextureLoader()
    const made = new Array(urls.length).fill(null)
    let left = urls.length
    const done = () => {
      left -= 1
      if (left <= 0 && alive) setTexs(made.slice())
    }
    urls.forEach((u, i) => {
      loader.load(
        u,
        (t) => {
          if (!alive) {
            t.dispose()
            return
          }
          t.colorSpace = THREE.SRGBColorSpace
          made[i] = t
          done()
        },
        undefined,
        () => done()
      )
    })
    return () => {
      alive = false
      made.forEach((t) => t && t.dispose())
    }
  }, [urls])
  return texs
}

/* ---------- 环境反射（关键质感来源） ----------
 * 没有环境贴图时，clearcoat(皮革/漆面)与金属只有点光源的一个小亮点，看起来「没质感」。
 * 这里用 three 自带的 RoomEnvironment 离线烘一张环境贴图（纯代码生成，不加载外部资源），
 * 让皮面/木漆面/金属拉手有连续的环境反射；intensity 压低，避免把房间照得发灰。
 */
function RoomEnv({ intensity = 0.45 }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const envScene = new RoomEnvironment()
    const tex = pmrem.fromScene(envScene, 0.04).texture
    scene.environment = tex
    scene.environmentIntensity = intensity
    return () => {
      tex.dispose()
      pmrem.dispose()
      envScene.traverse?.((o) => o.geometry?.dispose?.())
      scene.environment = null
    }
  }, [gl, scene, intensity])
  return null
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
        {/* 参考图：深红棕木地板带漆面光泽（clearcoat 出高光条） */}
        <meshPhysicalMaterial map={floorMap} roughness={0.38} clearcoat={0.45} clearcoatRoughness={0.28} />
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

/* ---------- 长桌：浅橡木桌面 + 同色抽屉柜，左抽屉柱 + 右抽屉，中部留空 ---------- */
function Desk({ woodMap, drawerOpen = false, onDrawerToggle }) {
  const kneeL = -0.42 // 桌下留空区左界
  const kneeR = 0.42 // 桌下留空区右界（椅子位置）
  const drawerYs = [0.24, 0.5, 0.76]
  const knob = (
    <meshStandardMaterial color={GOLD_METAL} roughness={0.35} metalness={0.6} />
  )
  return (
    <group>
      {/* 桌面（参考图：木面书桌，微漆光泽） */}
      <mesh position={[0, DESK_TOP_Y - 0.03, DESK_Z]} castShadow receiveShadow>
        <boxGeometry args={[DESK_L, 0.06, 0.62]} />
        <meshPhysicalMaterial map={woodMap} roughness={0.45} clearcoat={0.3} clearcoatRoughness={0.35} />
      </mesh>
      {/* 左抽屉柱（与桌面同色：浅橡木纹 + 轻微木头光泽） */}
      <mesh position={[-DESK_L / 2 + 0.25, 0.5, DESK_Z]} castShadow>
        <boxGeometry args={[0.46, 0.94, 0.56]} />
        <meshPhysicalMaterial map={woodMap} roughness={0.5} clearcoat={0.22} clearcoatRoughness={0.45} />
      </mesh>
      {drawerYs.map((y) => (
        <group key={`l${y}`}>
          <mesh position={[-DESK_L / 2 + 0.25, y, DESK_Z + 0.29]}>
            <boxGeometry args={[0.4, 0.2, 0.025]} />
            <meshPhysicalMaterial map={woodMap} roughness={0.5} clearcoat={0.22} clearcoatRoughness={0.45} />
          </mesh>
          <mesh position={[-DESK_L / 2 + 0.25, y, DESK_Z + 0.315]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.018, 12]} />
            {knob}
          </mesh>
        </group>
      ))}
      {/* 右抽屉柜（同样与桌面同色） */}
      <mesh position={[DESK_L / 2 - 0.5, 0.5, DESK_Z]} castShadow>
        <boxGeometry args={[0.85, 0.94, 0.56]} />
        <meshPhysicalMaterial map={woodMap} roughness={0.5} clearcoat={0.22} clearcoatRoughness={0.45} />
      </mesh>
      {/* 下层：普通抽屉面（不动） */}
      <group>
        <mesh position={[DESK_L / 2 - 0.5, 0.32, DESK_Z + 0.29]}>
          <boxGeometry args={[0.75, 0.26, 0.025]} />
          <meshPhysicalMaterial map={woodMap} roughness={0.5} clearcoat={0.22} clearcoatRoughness={0.45} />
        </mesh>
        <mesh position={[DESK_L / 2 - 0.5, 0.32, DESK_Z + 0.315]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.011, 0.011, 0.018, 12]} />
          {knob}
        </mesh>
      </group>
      {/* 最上面一格：可拉出（开合由父级 drawerOpen 控制） */}
      <PullOutDrawer woodMap={woodMap} open={drawerOpen} onToggle={onDrawerToggle} />
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
  /* 米白软包：柔和哑光（回到上一版质感） */
  const creamFabric = <meshStandardMaterial color="#f1ead9" roughness={0.95} />
  return (
    <group position={[0, 0, BACK_Z + 1.75]}>
      {/* 坐垫壳（米白软包） */}
      <RoundedBox args={[0.5, 0.08, 0.46]} radius={0.035} smoothness={4} position={[0, 0.44, 0]} castShadow receiveShadow>
        {creamFabric}
      </RoundedBox>
      {/* 靠背壳（米白软包，圆角、微微后仰） */}
      <RoundedBox args={[0.5, 0.44, 0.06]} radius={0.03} smoothness={4} position={[0, 0.68, 0.2]} rotation={[-0.12, 0, 0]} castShadow>
        {creamFabric}
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

/* ---------- 右侧书柜：浅粉奶油木柜体 + 暖光灯带 + 底部双抽（空腔填满） ----------
 * ⚠️ 装饰书的位置需与 ItemPlacement 的 SHELF_BUILTIN 保持一致：那边按这些 x 区间避让，
 *    否则用户放上去的书会和这里的装饰书重合穿模。
 */
function Bookshelf() {
  const W = 1.15
  const H = 2.55
  const D = 0.3
  const cx = ROOM_W / 2 - W / 2 - 0.35
  const shelfYs = [0.55, 1.05, 1.55, 2.05]
  const boardT = 0.035
  /* 柜内自带的装饰书：贴左侧竖放，底面严格落在层板顶面上（不再陷进层板）
   * row = 第几层（0 为最底层），x = 书脊中心（柜体局部坐标），h = 书高 */
  const books = [
    { row: 0, x: -0.44, h: 0.22, c: '#e8c8c8', tilt: 0 },
    { row: 0, x: -0.385, h: 0.235, c: '#c8d8c0', tilt: 0.05 },
    { row: 0, x: -0.33, h: 0.205, c: '#d8c8e8', tilt: 0 },
    { row: 1, x: -0.44, h: 0.21, c: '#f0e0c0', tilt: 0 },
    { row: 1, x: -0.385, h: 0.225, c: '#c0d0e0', tilt: -0.04 },
  ]
  /* 柜体：浅粉奶油木（参考图书柜的暖粉调），轻微漆面光泽 */
  const shell = <meshPhysicalMaterial color="#eac8b6" roughness={0.6} clearcoat={0.25} clearcoatRoughness={0.4} />
  /* ---------- 底部抽屉区 ----------
   * 底座顶面 0.06 → 第一层层板底面 0.5325，整个空腔用「两个抽屉 + 横档」填满，不留空缺：
   *   抽屉1  0.065 ~ 0.285   抽屉2  0.2975 ~ 0.5175
   *   中横档 0.285 ~ 0.2975  上封档 0.5175 ~ 0.5325
   */
  const baseTop = 0.06
  const cavityTop = shelfYs[0] - boardT / 2
  const drawerH = 0.22
  const gap = 0.0125
  const y0 = baseTop + 0.005
  const y1 = y0 + drawerH
  const y2 = y1 + gap
  const y3 = y2 + drawerH
  const drawerYs = [y0 + drawerH / 2, y2 + drawerH / 2]
  const rails = [
    [(y1 + y2) / 2, gap], // 两抽屉之间的中横档
    [(y3 + cavityTop) / 2, cavityTop - y3], // 顶部封档
  ]
  return (
    <group position={[cx, 0, BACK_Z + D / 2 + 0.03]}>
      {/* 背板 / 顶底 / 侧板（背板略浅一档，衬托彩色书脊） */}
      <mesh position={[0, H / 2, -D / 2 + 0.015]} receiveShadow>
        <boxGeometry args={[W, H, 0.03]} />
        <meshStandardMaterial color="#f3dcca" roughness={0.85} />
      </mesh>
      <mesh position={[0, H, 0]} castShadow>
        <boxGeometry args={[W + 0.06, 0.05, D]} />
        {shell}
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[W + 0.06, 0.06, D]} />
        {shell}
      </mesh>
      {[-W / 2, W / 2].map((x) => (
        <mesh key={x} position={[x, H / 2, 0]} castShadow>
          <boxGeometry args={[0.05, H, D]} />
          {shell}
        </mesh>
      ))}
      {/* 层板 + 灯带 */}
      {shelfYs.map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[W - 0.06, boardT, D - 0.04]} />
            {shell}
          </mesh>
          <mesh position={[0, y - 0.024, D / 2 - 0.08]}>
            <boxGeometry args={[W - 0.2, 0.012, 0.02]} />
            <meshStandardMaterial color={STRIP_WARM} emissive="#ffd9a0" emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
      {/* 自带装饰书：底面落在层板顶面（shelfY + boardT/2）上，不穿模 */}
      {books.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, shelfYs[b.row] + boardT / 2 + b.h / 2, 0.02]}
          rotation={[0, 0, b.tilt]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.05, b.h, 0.16]} />
          <meshStandardMaterial color={b.c} roughness={0.85} />
        </mesh>
      ))}
      <pointLight position={[0, 1.6, 0.1]} color="#ffd9a0" intensity={1.2} distance={1.6} decay={1.6} />
      {/* 底部抽屉区：先垫一层内腔背板（深色，就算有缝也只看到阴影，不会看穿到墙） */}
      <mesh position={[0, (baseTop + cavityTop) / 2, -D / 2 + 0.055]}>
        <boxGeometry args={[W - 0.1, cavityTop - baseTop - 0.01, 0.02]} />
        <meshStandardMaterial color="#d3bda9" roughness={0.95} />
      </mesh>
      {/* 两个抽屉：箱体（略缩进）+ 面板 + 金色圆拉手 */}
      {drawerYs.map((y) => (
        <group key={`drawer${y}`}>
          <mesh position={[0, y, -0.03]} castShadow>
            <boxGeometry args={[W - 0.12, drawerH - 0.02, D - 0.1]} />
            <meshStandardMaterial color="#dfbba9" roughness={0.8} />
          </mesh>
          <mesh position={[0, y, D / 2 - 0.014]} castShadow receiveShadow>
            <boxGeometry args={[W - 0.055, drawerH, 0.028]} />
            {shell}
          </mesh>
          <mesh position={[0, y, D / 2 + 0.008]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.018, 12]} />
            <meshStandardMaterial color={GOLD_METAL} roughness={0.35} metalness={0.6} />
          </mesh>
        </group>
      ))}
      {/* 横档：把抽屉之间、抽屉与层板之间的空隙填满 */}
      {rails.map(([y, h], i) => (
        <mesh key={`rail${i}`} position={[0, y, D / 2 - 0.03]}>
          <boxGeometry args={[W - 0.07, h, D - 0.06]} />
          {shell}
        </mesh>
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

/* ---------- 踢脚线 + 顶角线（参考图：深胡桃木收边，像顶部木梁的收口感） ---------- */
function Trims({ woodMap }) {
  const trim = <meshStandardMaterial map={woodMap} roughness={0.5} />
  return (
    <group>
      {/* 后墙踢脚线（避让抽屉柜，贴墙即可） */}
      <mesh position={[0, 0.06, BACK_Z + 0.09]} receiveShadow>
        <boxGeometry args={[ROOM_W, 0.12, 0.03]} />
        {trim}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (ROOM_W / 2 - 0.015), 0.06, 0]} receiveShadow>
          <boxGeometry args={[0.03, 0.12, ROOM_D]} />
          {trim}
        </mesh>
      ))}
      {/* 顶角线 */}
      <mesh position={[0, ROOM_H - 0.05, BACK_Z + 0.09]}>
        <boxGeometry args={[ROOM_W, 0.1, 0.05]} />
        {trim}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`t${s}`} position={[s * (ROOM_W / 2 - 0.025), ROOM_H - 0.05, 0]}>
          <boxGeometry args={[0.05, 0.1, ROOM_D]} />
          {trim}
        </mesh>
      ))}
    </group>
  )
}

/* ---------- 圆形地毯（参考图：红白格纹圆毯，纯贴图不换建模） ---------- */
function Rug() {
  const ginghamMap = useMemo(createGinghamTexture, [])
  return (
    <group position={[0.15, 0.012, 0.7]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.12, 40]} />
        <meshStandardMaterial map={ginghamMap} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[1.0, 1.08, 40]} />
        <meshStandardMaterial color="#c05a44" roughness={1} />
      </mesh>
    </group>
  )
}

/* ---------- 可拉出的抽屉（书桌右侧抽屉柜最上层） ----------
 * 真实的抽屉 = 面板 + 盒体（底 + 左右 + 后，前面就是面板）+ 拉手，整体沿 +z 滑出。
 * 柜体本身是实心块，所以额外放一块深色内腔背板：抽屉滑出后看到的是柜内阴影，
 * 而不是穿帮看到柜体的实心面。
 */
function PullOutDrawer({ woodMap, open, onToggle }) {
  const slider = useRef()
  const t = useRef(0)
  const { w, h, travel } = DESK_DRAWER
  const s = 0.016 // 抽屉板厚
  const D = 0.32 // 抽屉进深

  useFrame((_, delta) => {
    const g = slider.current
    if (!g) return
    const next = THREE.MathUtils.damp(t.current, open ? 1 : 0, 7, Math.min(delta, 0.05))
    t.current = next
    g.position.z = DESK_DRAWER.z + next * travel
  })

  const wood = (
    <meshPhysicalMaterial map={woodMap} roughness={0.5} clearcoat={0.22} clearcoatRoughness={0.45} />
  )
  const inner = <meshStandardMaterial color="#e7d9bd" roughness={0.85} />

  return (
    <group>
      {/* 柜内空腔背板（浅橡木内腔，比抽屉面板略深一档；抽屉拉出后露出来，有层次但不发黑） */}
      <mesh position={[DESK_DRAWER.x, DESK_DRAWER.y, DESK_DRAWER.z - 0.1]}>
        <boxGeometry args={[w - 0.05, h - 0.03, 0.16]} />
        <meshStandardMaterial color="#dcc194" roughness={0.9} />
      </mesh>

      {/* 抽屉本体：整体沿 z 滑出；点它任意一处都能开/关 */}
      <group
        ref={slider}
        position={[DESK_DRAWER.x, DESK_DRAWER.y, DESK_DRAWER.z]}
        onClick={(e) => {
          e.stopPropagation()
          onToggle?.()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      >
        {/* 面板 */}
        <mesh castShadow>{/* 居局部原点 */}
          <boxGeometry args={[w, h, 0.025]} />
          {wood}
        </mesh>
        {/* 拉手 */}
        <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.011, 0.011, 0.018, 12]} />
          <meshStandardMaterial color={GOLD_METAL} roughness={0.35} metalness={0.6} />
        </mesh>
        {/* 盒体：底 / 左 / 右 / 后（前面就是面板） */}
        <mesh position={[0, -h / 2 + s / 2, -D / 2 - 0.0125]}>
          <boxGeometry args={[w - 2 * s, s, D]} />
          {inner}
        </mesh>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * (w / 2 - s / 2), s / 2, -D / 2 - 0.0125]}>
            <boxGeometry args={[s, h - s, D]} />
            {inner}
          </mesh>
        ))}
        <mesh position={[0, s / 2, -D - 0.0125 + s / 2]}>
          <boxGeometry args={[w - 2 * s, h - s, s]} />
          {inner}
        </mesh>
        {/* 里面躺着的文件夹（给俯视镜头一点内容，也是弹窗的 3D 呼应） */}
        <mesh position={[0.04, -h / 2 + s + 0.008, -D / 2 - 0.02]} rotation={[0, 0.12, 0]}>
          <boxGeometry args={[0.5, 0.016, 0.24]} />
          <meshStandardMaterial color="#d9a55f" roughness={0.75} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- 布艺沙发（参考图：圆扶手 + 靠枕，放在房间左侧空位，朝向房间/镜头微倾） ---------- */
function Sofa({ woodMap }) {
  /* 沙发身：哑光布面（米白偏淡黄），回到上一版质感 */
  const plush = <meshStandardMaterial color="#f5edda" roughness={0.95} />
  /* 扶手卷：同族布面，米白（比沙发身更亮一点） */
  const fluffy = <meshStandardMaterial color="#fbf8f1" roughness={0.95} />
  return (
    <group position={[-2.05, 0, -0.7]} rotation={[0, 0.55, 0]}>
      {/* 底座（去掉了分体坐垫，改为整体软座，短绒） */}
      <RoundedBox args={[1.5, 0.32, 0.75]} radius={0.07} smoothness={4} position={[0, 0.3, 0]} castShadow receiveShadow>
        {plush}
      </RoundedBox>
      {/* 靠背（微微后仰） */}
      <RoundedBox args={[1.5, 0.5, 0.18]} radius={0.07} smoothness={4} position={[0, 0.72, -0.29]} rotation={[-0.08, 0, 0]} castShadow>
        {plush}
      </RoundedBox>
      {/* 扶手（圆角箱体 + 顶部的毛绒卷） */}
      {[-0.68, 0.68].map((x) => (
        <group key={x}>
          <RoundedBox args={[0.2, 0.38, 0.7]} radius={0.08} smoothness={4} position={[x, 0.52, 0]} castShadow>
            {plush}
          </RoundedBox>
          <mesh position={[x, 0.74, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.68, 16]} />
            {fluffy}
          </mesh>
        </group>
      ))}
      {/* 方形靠枕：焦糖色布面（回到上一版质感） */}
      <RoundedBox args={[0.36, 0.34, 0.12]} radius={0.05} smoothness={4} position={[-0.38, 0.63, -0.18]} rotation={[-0.25, 0.1, 0.06]} castShadow>
        <meshStandardMaterial color="#c9925e" roughness={0.7} />
      </RoundedBox>
      {/* 短木腿 */}
      {[
        [-0.62, -0.26],
        [0.62, -0.26],
        [-0.62, 0.26],
        [0.62, 0.26],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.07, z]} castShadow>
          <cylinderGeometry args={[0.025, 0.02, 0.14, 10]} />
          <meshStandardMaterial map={woodMap} roughness={0.55} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- 圆脚凳（参考图沙发前的方圆凳） ---------- */
function Pouf() {
  return (
    <group position={[-1.15, 0, 0.55]}>
      <RoundedBox args={[0.5, 0.3, 0.5]} radius={0.12} smoothness={4} position={[0, 0.19, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f5efe1" roughness={0.95} />
      </RoundedBox>
    </group>
  )
}

/* ---------- 小圆边几 + 两只茶杯（参考图沙发旁） ---------- */
function SideTable() {
  return (
    <group position={[-2.55, 0, 0.75]}>
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.21, 0.21, 0.035, 24]} />
        <meshStandardMaterial color={FURNITURE_CREAM} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 0.46, 12]} />
        <meshStandardMaterial color={GOLD_METAL} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.13, 0.04, 20]} />
        <meshStandardMaterial color={FURNITURE_CREAM} roughness={0.85} />
      </mesh>
      {/* 两只小茶杯 */}
      {[-0.07, 0.08].map((x, i) => (
        <mesh key={i} position={[x, 0.52, i ? 0.05 : -0.04]} castShadow>
          <cylinderGeometry args={[0.032, 0.026, 0.045, 14]} />
          <meshStandardMaterial color="#ffffff" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- 盆栽（参考图：沙发旁的观叶植物） ---------- */
function PottedPlant() {
  const leaves = [
    { p: [0, 0.36, 0], r: [0, 0, 0] },
    { p: [0.09, 0.32, 0.05], r: [0, 1.0, 0.5] },
    { p: [-0.09, 0.33, -0.04], r: [0, 2.4, -0.5] },
    { p: [0.04, 0.4, -0.07], r: [-0.45, 3.6, 0.2] },
    { p: [-0.05, 0.38, 0.07], r: [0.45, 4.8, -0.3] },
  ]
  return (
    <group position={[-2.7, 0, -2.4]}>
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.085, 0.18, 18]} />
        <meshStandardMaterial color="#f8f6f1" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.175, 0]}>
        <cylinderGeometry args={[0.095, 0.095, 0.02, 18]} />
        <meshStandardMaterial color="#8a7a63" roughness={1} />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.p} rotation={l.r} castShadow>
          <coneGeometry args={[0.05, 0.34, 8]} />
          <meshStandardMaterial color={i % 2 ? '#a9bb9d' : '#b7c6a9'} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- 右墙相框墙（参考图右侧的错落木框白芯照片墙；完全平贴墙面） ----------
 * 交互：点击任意相框 → 打开照片墙（镜头推近 + 背景虚化，见 RoomBackground 的 'wall' 阶段）
 * photos：照片墙里已插入的图片贴图（按顺序对应到相框）；没有照片的相框保持白相纸。
 */
export const WALL_FRAME_X = 2.9815 // 相框所在的 x（右墙内侧，留 1.5mm 缝防 z-fighting）
export const WALL_FRAMES = [
  { z: -1.6, y: 2.25, w: 0.42, h: 0.32 },
  { z: -0.95, y: 2.3, w: 0.3, h: 0.4 },
  { z: -1.3, y: 1.75, w: 0.38, h: 0.48 },
  { z: -0.55, y: 1.78, w: 0.32, h: 0.32 },
  { z: -0.95, y: 2.68, w: 0.34, h: 0.26 },
]

function WallFrames({ woodMap, photos = [], onFrameClick }) {
  /* 照片按相框内框尺寸做「居中覆盖裁切」UV，避免拉伸变形 */
  const fitted = useMemo(() => {
    return WALL_FRAMES.map((f, i) => {
      const t = photos[i]
      const img = t && t.image
      if (!img || !img.width || !img.height) return null
      const pw = Math.max(0.01, f.w - 0.14)
      const ph = Math.max(0.01, f.h - 0.14)
      const boxAspect = pw / ph
      const imgAspect = img.width / img.height
      if (imgAspect > boxAspect) {
        const k = boxAspect / imgAspect
        t.repeat.set(k, 1)
        t.offset.set((1 - k) / 2, 0)
      } else {
        const k = imgAspect / boxAspect
        t.repeat.set(1, k)
        t.offset.set(0, (1 - k) / 2)
      }
      return t
    })
  }, [photos])

  return (
    <group>
      {WALL_FRAMES.map((f, i) => (
        // rotation.y = -π/2：框面严格平行墙面（背面完全贴墙，绝不穿模）
        <group
          key={i}
          position={[WALL_FRAME_X, f.y, f.z]}
          rotation={[0, -Math.PI / 2, 0]}
          onClick={(e) => {
            e.stopPropagation()
            onFrameClick?.(i)
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = ''
          }}
        >
          <RoundedBox args={[f.w, f.h, 0.035]} radius={0.012} smoothness={3} castShadow>
            <meshStandardMaterial map={woodMap} roughness={0.5} />
          </RoundedBox>
          {/* 白色相纸（参考图：深木框 + 大面积白卡纸） */}
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[f.w - 0.08, f.h - 0.08]} />
            <meshStandardMaterial color="#fdfbf4" roughness={0.95} />
          </mesh>
          {/* 照片墙里放进去的照片：贴在相纸正中（比相纸再小一圈，像装裱） */}
          {fitted[i] && (
            <mesh position={[0, 0, 0.024]}>
              <planeGeometry args={[f.w - 0.14, f.h - 0.14]} />
              <meshStandardMaterial map={fitted[i]} roughness={0.86} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

/* ---------- 房间整体（weather: 'sunny'|'cloudy'|'rain'|'snow'|''；season: 'spring'|'summer'|'autumn'|'winter'|''）
 * framePhotos：照片墙里已插入的图片（dataURL 数组，前 5 张挂到相框墙上）
 * onFrameClick：点击任意相框的回调（由 RoomBackground 切到 'wall' 阶段） ---------- */
export function Room25DModel({
  weather = '',
  season = '',
  drawerOpen = false,
  onDrawerToggle,
  framePhotos = NO_FRAME_PHOTOS,
  onFrameClick,
  ...props
}) {
  /* 木色——
   * 地板：中棕原木，家具/收边：深棕木，椅腿仍为琥珀木
   * 书桌：浅橡木（用户指定参考图：淡蜂蜜色橡木，桌面/抽屉柜/抽屉同一色） */
  const floorMap = useMemo(() => createWoodTexture([158, 102, 60], 'rgba(96,58,32,0.5)'), [])
  const walnutMap = useMemo(() => createWoodTexture([104, 62, 42], 'rgba(45,24,14,0.6)'), [])
  const amberMap = useMemo(() => createWoodTexture([196, 152, 96], 'rgba(110,80,45,0.4)'), [])
  const oakMap = useMemo(() => createWoodTexture([226, 196, 152], 'rgba(170,132,86,0.3)'), [])
  const W = WEATHER[weather] || WEATHER_DEFAULT
  const skyMap = useMemo(() => createSkyTexture(W.sky, W.cloud, W.sun), [W])
  /* 四季：窗外换成对应季节的照片，窗光/全局光随季节明暗变化；未选季节则完全走原天气逻辑 */
  const seasonTex = useSeasonTexture(season)
  const frameTexs = usePhotoTextures(framePhotos)
  const seasonCfg = SEASON_MAP[season]
  const winMap = seasonTex || skyMap
  const lightColor = seasonCfg ? seasonCfg.light : W.light
  const lightIntensity = seasonCfg ? seasonCfg.intensity : W.intensity
  return (
    <group {...props}>
      <Shell floorMap={floorMap} />
      <WindowWall skyMap={winMap} lightColor={lightColor} lightIntensity={lightIntensity} />
      <Sunlight weather={weather} />
      <Precipitation weather={weather} />
      <Desk woodMap={oakMap} drawerOpen={drawerOpen} onDrawerToggle={onDrawerToggle} />
      <Chair woodMap={amberMap} />
      <Bookshelf />
      {/* 参考图新增：相框墙（右墙）+ 沙发区（左侧）+ 收边/圆毯 */}
      <WallFrames woodMap={walnutMap} photos={frameTexs} onFrameClick={onFrameClick} />
      <Sofa woodMap={amberMap} />
      <Pouf />
      <SideTable />
      <PottedPlant />
      <Rug />
      <Trims woodMap={walnutMap} />
      <CeilingLamp />
    </group>
  )
}

/* ---------- 场景 ---------- */
export default function Room25DScene({ weather = '' }) {
  const W = WEATHER[weather] || WEATHER_DEFAULT
  return (
    <Canvas
      shadows="soft" /* 软阴影：接近微缩摄影棚的柔光质感 */
      camera={{ position: CAM_POS, fov: CAM_FOV }}
      style={{ width: '100%', height: '100vh' }}
      gl={{ toneMappingExposure: 1.05 }}
    >
      <color attach="background" args={['#ece3d7']} />
      <RoomEnv intensity={0.45} />
      {/* 环境光/主光随天气变化：雨天整体压暗偏冷，晴天暖亮 */}
      <ambientLight intensity={W.ambient * 0.85} color="#fff6ee" />
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
