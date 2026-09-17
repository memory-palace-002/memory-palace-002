/**
 * ItemPresets —— 物品栏的预设建模（纯 Three.js 基础几何体，零外部 GLB）
 *
 * 风格与 Room25D 房间一致：米色/奶油色系 + 琥珀木 + 金色小件，软哑光材质。
 * 每个预设都定义了一个「贴面区」(decal zone)：用户上传的图片经 stylizeDecal
 * 风格化后，作为贴面贴到这里——马克杯是环绕杯身的弧面、相框是相纸、
 * 盆栽是挂在盆上的小铭牌、书是封面。贴面圆角 + 米色边框 + 轻微暖色调和，不穿帮。
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'

export interface PresetDef {
  id: string
  label: string
  icon: string
  aspect: number // 贴面区宽高比（w/h）
  shadowR: number // 底部软影子半径
}

export const PRESETS: PresetDef[] = [
  { id: 'mug', label: '马克杯', icon: '🥛', aspect: 1.15, shadowR: 0.09 },
  { id: 'frame', label: '相框', icon: '🖼️', aspect: 1.33, shadowR: 0.15 },
  { id: 'plant', label: '小盆栽', icon: '🪴', aspect: 1.25, shadowR: 0.09 },
  { id: 'book', label: '一本书', icon: '📕', aspect: 0.78, shadowR: 0.12 },
]

export const getPreset = (id: string) => PRESETS.find((p) => p.id === id) || PRESETS[0]

/* ---------- 默认贴面（未上传图片时的占位：暖色渐变 + emoji + 品名） ---------- */
const decalCache = new Map<string, string>()
export function getPresetDecal(preset: string): string {
  const hit = decalCache.get(preset)
  if (hit) return hit
  const def = getPreset(preset)
  const W = 320
  const H = Math.round(W / def.aspect)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#f8f1e2')
  g.addColorStop(1, '#ecdfc4')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  /* 淡淡的斜纹，像织物/陶瓷质感 */
  ctx.strokeStyle = 'rgba(150,120,80,0.06)'
  ctx.lineWidth = 10
  for (let i = -H; i < W; i += 34) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + H, H)
    ctx.stroke()
  }
  ctx.font = `${Math.round(H * 0.34)}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(def.icon, W / 2, H * 0.44)
  ctx.fillStyle = '#8a6f4a'
  ctx.font = `600 ${Math.round(H * 0.09)}px sans-serif`
  ctx.fillText(def.label, W / 2, H * 0.8)
  const url = c.toDataURL('image/png')
  decalCache.set(preset, url)
  return url
}

/* ---------- 各预设建模（group 原点在底部中心，y=0 落地） ---------- */

function MugModel({ tex }: { tex: THREE.Texture | null }) {
  const R = 0.085
  return (
    <group>
      {/* 杯身 */}
      <mesh position={[0, 0.075, 0]} castShadow>
        <cylinderGeometry args={[R, R * 0.92, 0.15, 28]} />
        <meshStandardMaterial color="#f2e7cf" roughness={0.55} />
      </mesh>
      {/* 杯口内沿（深一档，有「杯」的感觉） */}
      <mesh position={[0, 0.152, 0]}>
        <cylinderGeometry args={[R * 0.86, R * 0.86, 0.006, 28]} />
        <meshStandardMaterial color="#e2d5b8" roughness={0.7} />
      </mesh>
      {/* 杯柄（半环朝 +x 外侧） */}
      <mesh position={[R + 0.02, 0.075, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <torusGeometry args={[0.036, 0.011, 12, 24, Math.PI]} />
        <meshStandardMaterial color="#f2e7cf" roughness={0.55} />
      </mesh>
      {/* 贴面：环绕杯身正面的弧面（theta 中心对准 +z，即镜头方向），宽高比 1.15 */}
      {tex && (
        <mesh position={[0, 0.075, 0]}>
          <cylinderGeometry args={[R + 0.0015, R * 0.92 + 0.0015, 0.1, 24, 1, true, -0.675, 1.35]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

function FrameModel({ tex }: { tex: THREE.Texture | null }) {
  const W = 0.34
  const H = 0.44
  const D = 0.035
  const imgH = W / 1.33
  return (
    <group rotation={[-0.07, 0, 0]}>
      {/* 相框体 */}
      <RoundedBox args={[W, H, D]} radius={0.014} smoothness={3} position={[0, H / 2 + 0.01, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f4edde" roughness={0.8} />
      </RoundedBox>
      {/* 相纸（贴面） */}
      {tex && (
        <mesh position={[0, H / 2 + 0.01, D / 2 + 0.003]}>
          <planeGeometry args={[W - 0.08, imgH - 0.02]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
      {/* 后支撑腿 */}
      <mesh position={[0, 0.09, -D - 0.035]} rotation={[0.5, 0, 0]} castShadow>
        <boxGeometry args={[0.035, 0.2, 0.012]} />
        <meshStandardMaterial color="#c49860" roughness={0.6} />
      </mesh>
    </group>
  )
}

function PlantModel({ tex }: { tex: THREE.Texture | null }) {
  return (
    <group>
      {/* 盆 */}
      <mesh position={[0, 0.055, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.058, 0.11, 24]} />
        <meshStandardMaterial color="#e8d7bd" roughness={0.75} />
      </mesh>
      {/* 盆沿 */}
      <mesh position={[0, 0.112, 0]} castShadow>
        <torusGeometry args={[0.075, 0.008, 10, 24]} />
        <meshStandardMaterial color="#e8d7bd" roughness={0.75} />
      </mesh>
      {/* 土 */}
      <mesh position={[0, 0.114, 0]}>
        <cylinderGeometry args={[0.066, 0.066, 0.008, 24]} />
        <meshStandardMaterial color="#6b5436" roughness={1} />
      </mesh>
      {/* 叶子：三片错开的圆锥，低饱和绿（融入奶油色房间） */}
      {[
        { x: 0, y: 0.2, z: 0, rz: 0, s: 1, c: '#95b182' },
        { x: -0.035, y: 0.17, z: 0.01, rz: -0.5, s: 0.8, c: '#8aa876' },
        { x: 0.033, y: 0.175, z: -0.012, rz: 0.45, s: 0.85, c: '#a3bd8e' },
      ].map((l, i) => (
        <mesh key={i} position={[l.x, l.y, l.z]} rotation={[0.1, 0, l.rz]} scale={[1, 1.6 * l.s, 1]} castShadow>
          <coneGeometry args={[0.024, 0.09, 10]} />
          <meshStandardMaterial color={l.c} roughness={0.85} />
        </mesh>
      ))}
      {/* 盆上小铭牌贴面 */}
      {tex && (
        <mesh position={[0.012, 0.06, 0.0745]} rotation={[0, 0.12, 0]}>
          <planeGeometry args={[0.07, 0.056]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

function BookModel({ tex }: { tex: THREE.Texture | null }) {
  const W = 0.2
  const H = 0.28
  const D = 0.045
  return (
    <group rotation={[0, 0, 0.05]}>
      {/* 书芯（书页侧面） */}
      <mesh position={[0.004, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#f7f2e6" roughness={0.9} />
      </mesh>
      {/* 封面壳（比书芯大一圈，只包三边，露出右侧书页） */}
      <mesh position={[-0.004, H / 2, 0]} castShadow>
        <boxGeometry args={[0.008, H + 0.008, D + 0.006]} />
        <meshStandardMaterial color="#cf9a4e" roughness={0.7} />
      </mesh>
      <mesh position={[0, H / 2 + 0.004, 0]} castShadow>
        <boxGeometry args={[W + 0.008, 0.008, D + 0.006]} />
        <meshStandardMaterial color="#cf9a4e" roughness={0.7} />
      </mesh>
      <mesh position={[0, H / 2 - 0.004, 0]} castShadow>
        <boxGeometry args={[W + 0.008, 0.008, D + 0.006]} />
        <meshStandardMaterial color="#cf9a4e" roughness={0.7} />
      </mesh>
      <mesh position={[0, H / 2, D / 2 + 0.002]} castShadow>
        <boxGeometry args={[W + 0.008, H + 0.008, 0.006]} />
        <meshStandardMaterial color="#cf9a4e" roughness={0.7} />
      </mesh>
      {/* 封面贴面（用户图片 → 封面） */}
      {tex && (
        <mesh position={[0.002, H / 2, D / 2 + 0.006]}>
          <planeGeometry args={[W - 0.05, (W - 0.05) / 0.78]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/* ---------- 出口：按 preset id 渲染对应建模，并加载贴面纹理 ---------- */
export function ItemModel({ preset, decal }: { preset: string; decal: string | null }) {
  const url = decal || getPresetDecal(preset)
  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load(url)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [url])
  useEffect(() => () => tex.dispose(), [tex])

  if (preset === 'mug') return <MugModel tex={tex} />
  if (preset === 'frame') return <FrameModel tex={tex} />
  if (preset === 'plant') return <PlantModel tex={tex} />
  if (preset === 'book') return <BookModel tex={tex} />
  return null
}
