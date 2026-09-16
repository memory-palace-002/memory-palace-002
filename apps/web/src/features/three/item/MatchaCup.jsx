/**
 * MatchaCup —— 用 Three.js 基础几何体还原一杯冰抹茶（纯模型组件）
 *
 * 透明杯身 + 抹茶绿液体 + 白色 MATCHA 标签 + 黑色吸管 + 顶部冰块
 * 不使用外部 GLB；标签文字用 CanvasTexture 运行时生成。
 * 只导出模型 group，不含 Canvas / 灯光 / 控制器，由宿主场景提供环境。
 *
 * 通过 props 适配宿主变换：<MatchaCup position={...} rotation={...} scale={...} />
 */
import React, { useMemo } from "react"
import * as THREE from "three"

/* ---------- 配色 ---------- */
const MATCHA_GREEN = "#7d9c40" // 抹茶液体主体
const MATCHA_DARK = "#5f7d30" // 液面（略深）
const LABEL_CREAM = "#f4f1e6" // 标签米白
const CUP_TINT = "#eef4ea" // 塑料杯淡淡的反光色
const STRAW_BLACK = "#1c1c1e" // 吸管黑

/* ---------- 标签贴图：运行时用 Canvas 画出 "MATCHA" 标签 ---------- */
function createLabelTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 640
  canvas.height = 640
  const ctx = canvas.getContext("2d")

  // 米白纸质底色
  ctx.fillStyle = LABEL_CREAM
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 顶部细线
  ctx.strokeStyle = "#3c4630"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(48, 92)
  ctx.lineTo(592, 92)
  ctx.stroke()

  // 主标题 MATCHA
  ctx.fillStyle = "#3c4630"
  ctx.font = "bold 92px Arial, sans-serif"
  ctx.fillText("MATCHA", 48, 210)

  // 小字说明
  ctx.fillStyle = "#6b6f60"
  ctx.font = "22px Arial, sans-serif"
  const lines = [
    "Iced matcha, stone-ground and",
    "whisked to a smooth finish.",
    "",
    "Keep chilled. Shake well",
    "before drinking.",
  ]
  lines.forEach((t, i) => ctx.fillText(t, 48, 300 + i * 34))

  // 底部绿色小标签块
  ctx.fillStyle = "#49632c"
  ctx.beginPath()
  ctx.roundRect(48, 500, 250, 62, 8)
  ctx.fill()
  ctx.fillStyle = LABEL_CREAM
  ctx.font = "26px Arial, sans-serif"
  ctx.fillText("Well injected", 70, 540)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/* ---------- 冰块摆放（位置 / 旋转 / 尺寸），只露出液面约 1/10 ---------- */
const ICE_CUBES = [
  { p: [-0.45, 0.84, 0.3], r: [0.4, 0.7, 0.25], s: 0.4 },
  { p: [0.35, 0.856, -0.35], r: [0.6, 0.2, 0.5], s: 0.36 },
  { p: [0.05, 0.864, 0.45], r: [0.3, 0.9, 0.6], s: 0.34 },
  { p: [-0.55, 0.872, -0.3], r: [0.5, 0.4, 0.3], s: 0.32 },
  { p: [0.5, 0.88, 0.25], r: [0.7, 0.5, 0.2], s: 0.3 },
]

/* ---------- 单杯模型 ---------- */
export default function MatchaCup(props) {
  const labelTexture = useMemo(createLabelTexture, [])

  return (
    <group {...props}>
      {/* 杯身：上宽下窄的透明圆柱（开口），带 clearcoat 塑料反光 */}
      <mesh>
        <cylinderGeometry args={[1.15, 0.92, 3.2, 48, 1, true]} />
        <meshPhysicalMaterial
          color={CUP_TINT}
          transparent
          opacity={0.22}
          roughness={0.05}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 杯底 */}
      <mesh position={[0, -1.58, 0]}>
        <cylinderGeometry args={[0.9, 0.82, 0.12, 48]} />
        <meshPhysicalMaterial
          color={CUP_TINT}
          transparent
          opacity={0.35}
          roughness={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 杯口圈（Torus） */}
      <mesh position={[0, 1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.15, 0.05, 16, 64]} />
        <meshPhysicalMaterial
          color={CUP_TINT}
          transparent
          opacity={0.3}
          roughness={0.1}
        />
      </mesh>

      {/* 抹茶液体：实色圆柱，顶面约 y=1.0，漫过冰块只露 1/10 */}
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[1.06, 0.9, 2.5, 48]} />
        <meshStandardMaterial color={MATCHA_GREEN} roughness={0.55} />
      </mesh>

      {/* 液面：比液体略深的圆盘 */}
      <mesh position={[0, 1.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.06, 48]} />
        <meshStandardMaterial color={MATCHA_DARK} roughness={0.7} />
      </mesh>

      {/* 冰块：半透明白色小方块 */}
      {ICE_CUBES.map((c, i) => (
        <mesh key={i} position={c.p} rotation={c.r} scale={c.s}>
          <boxGeometry args={[1, 1, 1]} />
          <meshPhysicalMaterial
            color="#e9f2e2"
            transparent
            opacity={0.75}
            roughness={0.25}
          />
        </mesh>
      ))}

      {/* 白色标签：部分弧长的薄圆柱面（正对 +Z 方向），贴 Canvas 文字贴图 */}
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry
          args={[1.18, 1.0, 1.7, 48, 1, true, -Math.PI * 0.62, Math.PI * 1.24]}
        />
        <meshStandardMaterial
          map={labelTexture}
          roughness={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 黑色吸管：细长圆柱，向右侧倾斜，穿过冰块伸出杯口 */}
      <group position={[0.18, 0.95, 0.1]} rotation={[0.06, 0, -0.3]}>
        <mesh>
          <cylinderGeometry args={[0.07, 0.07, 4.4, 16]} />
          <meshStandardMaterial color={STRAW_BLACK} roughness={0.4} />
        </mesh>
      </group>
    </group>
  )
}
