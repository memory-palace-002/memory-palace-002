/**
 * ItemPlacement —— 物品摆放组件（解耦重构产物）
 *
 * 只负责处理物品的增删改与展示逻辑，依赖 RoomBackground 但不修改它：
 *   - useItemPlacement()   物品/贴片的全部状态与操作（添加、拖拽、缩放、AI 抠图、圈选截取、回忆卡片、换贴面、本地存档）
 *   - <ItemPlacementScene> 3D 部分：贴片平面 + 物品建模（必须挂在 RoomBackground 的 Canvas 里）
 *   - <ItemPlacementOverlay> HTML 部分：物品栏 / 上传 / 三选一 / 圈选编辑器 / 抠图进度 / 回忆卡片
 *
 * ⚠️ 分支纪律（feature-item-placement）：增删改物品功能都在本文件进行；
 *    不要动 RoomBackground.tsx / Room25D.jsx（房间背景归 feature-room-background 分支管）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { DESK_TOP_Y, DESK_Z, DESK_L } from './Room25D'
import { stickerize, addStickerBorder, cutWithLasso, flattenImage, stylizeDecal } from './matting'
import { PRESETS, getPreset, getPresetDecal, ItemModel } from './ItemPresets'

/* ---------- 常量 ---------- */
const STORAGE_KEY = 'memory-room3d/stickers-v1'
const STAND_H = 0.26 // 贴片的显示高度（世界单位）

/* 拖动活动范围（房间内）：左右 / 高度 / 前后
 * 相机改为「室内第一人称」后，只有镜头前方（z 更小的一侧）才可见，
 * 所以 zMax 收紧到 -0.8：避免物品/贴片被拖到镜头背后看不见（相机在 z≈-0.35） */
const BOUND = { x: 2.7, yMin: 0.03, yMax: 2.75, zMin: -2.85, zMax: -0.8 }

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
  rotY: number // 朝向微偏（弧度，Shift+滚轮可旋转）
  scale?: number // 缩放（按住左键滚轮调整；1 = 默认显示大小）
  meta: StickerMeta | null
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const uid = () => Math.random().toString(36).slice(2, 9)

/* 贴片缩放范围（还原之前的缩放功能） */
const STICKER_SCALE = { min: 0.5, max: 2.5 }
/* 左右墙吸附：ROOM_W=6，墙面内侧 x=±3（留 0.015 防止 z-fighting）；
 * 距墙 WALL_SNAP 内开始吸附，越近吸得越紧（贴墙旋转 + 位置贴向墙面） */
const WALL_INNER_X = 2.985
const WALL_SNAP = 0.55
/* 物品缩放上限：物品包围盒最大边不得超过房间（最短边 3m）的四分之一 = 0.75m */
const ITEM_MAX_DIM = 0.75

/* ---------- 物品栏（预设建模 + 用户贴图） ---------- */
const ITEMS_KEY = 'memory-room3d/items-v1'

interface InvItem {
  id: string
  preset: string // PRESETS 里的 id
  x: number
  y: number // 底部高度（物品默认站在桌面）
  z: number
  rotY: number
  scale?: number // 缩放（按住左键拖动时滚轮调整；1 = 原始大小）
  decal: string | null // 风格化后的贴面 dataURL（null = 用预设默认贴面）
  meta: StickerMeta | null
}

function loadItems(): InvItem[] {
  try {
    const list = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]') as InvItem[]
    /* 老数据没有 scale 补默认值；旧版允许缩到 0.4，现在下限是 1，一并归一。
     * 另外相机改为室内第一人称后镜头后方不可见：把跑到镜头后面的物品拉回前方 */
    return list.map((i) => ({
      ...i,
      scale: typeof i.scale === 'number' ? Math.max(1, i.scale) : 1,
      z: typeof i.z === 'number' ? clamp(i.z, BOUND.zMin, BOUND.zMax) : i.z,
    }))
  } catch {
    return []
  }
}

/* ---------- 书柜排架（四层都能放书，多本并排，且不与柜内原有装饰书重叠） ----------
 * 数值来自 Room25D.jsx 的 Bookshelf（只读参考，不修改背景文件）：
 *   ROOM_W=6, BACK_Z=-3；书柜宽 1.15 深 0.3，中心 cx = 3 - 1.15/2 - 0.35 = 2.075
 *   柜体 group 的 z = BACK_Z + D/2 + 0.03 = -2.82（下面 z 均指世界坐标）
 *   层板 y = [0.55, 1.05, 1.55, 2.05]，板厚 0.035 → 层板顶面 = y + 0.0175
 *   内腔：去掉两侧 0.05 厚侧板后可用半宽 0.50；深度方向约 -2.94 ~ -2.67
 * 书本模型（ItemPresets BookModel）：封面 0.2 宽 × 0.28 高 × 0.045 厚（含壳厚 0.051）
 *   竖放（rotY = π/2）后：沿 x 是书脊厚度、沿 z 是封面宽 0.2、总高 0.288
 */
const SHELF = {
  cx: 2.075,
  innerHalf: 0.5, // 书可占据的 x 半宽（不超出柜体内壁）
  ys: [0.55, 1.05, 1.55, 2.05], // 层板高度
  top: 0.0175, // 层板半厚（顶面偏移）
  zPlace: -2.81, // 书竖放后的 z（内腔偏前，避免扎进背板）
  zRange: [-2.96, -2.55] as [number, number], // z 落在此区间才算「放进书柜」
  yRange: [0.3, 2.35] as [number, number],
}
const BOOK = { thick: 0.051, height: 0.288, depth: 0.2 } // 竖放后的占位
const BOOK_GAP = 0.012 // 书与书之间的空隙
/* 层内净高 = 层距 0.5 - 板厚 0.035，留 0.02 余量；深度方向内腔 0.27，留余量 */
const BOOK_MAX_SCALE = Math.min((0.5 - 0.035 - 0.02) / BOOK.height, (0.27 - 0.02) / BOOK.depth) // ≈1.25

/* 书柜自带的装饰书：每层已占用的 x 区间（世界坐标，来自 Room25D Bookshelf）。
 * 用户放的书必须避开这些区间，否则会和原有建模重合穿模。 */
const SHELF_BUILTIN: Record<number, Array<[number, number]>> = {
  0: [[SHELF.cx - 0.475, SHELF.cx - 0.29]], // 第 1 层（自下往上）左侧三本
  1: [[SHELF.cx - 0.475, SHELF.cx - 0.345]], // 第 2 层左侧两本
}

type Interval = [number, number]

/* 书本是否落在书柜区域内 */
const inShelfRegion = (b: { preset: string; x: number; y: number; z: number }) =>
  b.preset === 'book' &&
  Math.abs(b.x - SHELF.cx) <= SHELF.innerHalf + 0.12 &&
  b.z >= SHELF.zRange[0] &&
  b.z <= SHELF.zRange[1] &&
  b.y >= SHELF.yRange[0] &&
  b.y <= SHELF.yRange[1]

/* y 离哪层层板最近（返回层序号 0~3） */
function shelfRowIndex(y: number): number {
  let best = 0
  for (let i = 1; i < SHELF.ys.length; i++) {
    if (Math.abs(SHELF.ys[i] + SHELF.top - y) < Math.abs(SHELF.ys[best] + SHELF.top - y)) best = i
  }
  return best
}

/* 上架时书本的缩放：不得小于 1，也不得大到顶穿上层板或探出柜体 */
const shelfScale = (b: { scale?: number }) => clamp(b.scale || 1, 1, BOOK_MAX_SCALE)

/* 某层剩余的空隙区间（扣掉装饰书和已放的书） */
function freeSegments(row: number, occupied: Interval[]): Interval[] {
  const left = SHELF.cx - SHELF.innerHalf
  const right = SHELF.cx + SHELF.innerHalf
  const blocks = [...(SHELF_BUILTIN[row] || []), ...occupied].sort((a, b) => a[0] - b[0])
  const segs: Interval[] = []
  let cursor = left
  for (const [a, b] of blocks) {
    if (a > cursor) segs.push([cursor, Math.min(a, right)])
    cursor = Math.max(cursor, b)
  }
  if (cursor < right) segs.push([cursor, right])
  return segs.filter(([a, b]) => b - a > 0.001)
}

/* 在一层里给一本书找位置：优先贴近它自己被拖到的 x，放不下返回 null */
function placeInRow(row: number, occupied: Interval[], preferX: number, width: number) {
  let best: { x: number; span: Interval; dist: number } | null = null
  for (const [a, b] of freeSegments(row, occupied)) {
    if (b - a < width - 1e-6) continue
    const x = clamp(preferX, a + width / 2, b - width / 2)
    const dist = Math.abs(x - preferX)
    if (!best || dist < best.dist) best = { x, span: [x - width / 2, x + width / 2], dist }
  }
  return best
}

/**
 * 全屋书柜排架：一次性给所有「放进书柜的书」分配层位与 x，保证
 *   ① 四层都能放；② 同层多本并排不重叠；③ 不与柜内原有装饰书重合；④ 不超出柜体内壁。
 * 放不下的书（层都满了）不吸附，保持用户拖到的位置。
 */
function computeShelfLayout(items: InvItem[]): Map<string, { x: number; y: number; z: number; rotY: number; scale: number }> {
  const result = new Map<string, { x: number; y: number; z: number; rotY: number; scale: number }>()
  /* 自下而上依次安排，保证同层顺序稳定（不会每次渲染来回跳） */
  const books = items.filter(inShelfRegion).sort((a, b) => a.y - b.y)
  const occupied: Interval[][] = [[], [], [], []]
  for (const b of books) {
    const scale = shelfScale(b)
    const width = BOOK.thick * scale
    const preferred = shelfRowIndex(b.y)
    const rows = [0, 1, 2, 3].sort((i, j) => Math.abs(i - preferred) - Math.abs(j - preferred))
    for (const r of rows) {
      const spot = placeInRow(r, occupied[r], b.x, width)
      if (!spot) continue
      /* 占位区间外扩半条缝，让相邻的书（以及柜内原有装饰书）之间始终留出可见缝隙 */
      occupied[r].push([spot.span[0] - BOOK_GAP / 2, spot.span[1] + BOOK_GAP / 2])
      occupied[r].sort((p, q) => p[0] - q[0])
      result.set(b.id, {
        x: spot.x,
        y: SHELF.ys[r] + SHELF.top,
        z: SHELF.zPlace,
        rotY: Math.PI / 2, // 书脊朝观众
        scale,
      })
      break
    }
  }
  return result
}

/* 物品出生点：桌面留白区（避开左端台灯） */
function spawnItemPose() {
  return {
    x: clamp(-1.0 + Math.random() * 2.0, -DESK_L / 2 + 0.5, DESK_L / 2 - 0.45),
    y: DESK_TOP_Y,
    z: DESK_Z + (Math.random() * 0.12 - 0.06),
    rotY: (Math.random() - 0.5) * 0.3,
  }
}

/* 物品在卡片里复用贴片的照片区：构造一张「虚拟贴片」 */
function itemAsSticker(item: InvItem): Sticker3D {
  const url = item.decal || getPresetDecal(item.preset)
  const aspect = getPreset(item.preset).aspect
  return {
    id: item.id,
    src: url,
    sticker: url,
    w: 100,
    h: Math.round(100 / aspect),
    x: item.x,
    y: item.y,
    z: item.z,
    rotY: item.rotY,
    meta: item.meta,
  }
}

/* 新贴片出生点：书桌前方的空中（镜头正前方，进入房间就能看到），用户可再随意拖动 */
function spawnPose() {
  return {
    x: clamp(-0.7 + Math.random() * 1.4, -BOUND.x, BOUND.x),
    y: clamp(0.92 + Math.random() * 0.36, BOUND.yMin, BOUND.yMax),
    z: clamp(-2.2 + Math.random() * 0.6, BOUND.zMin, BOUND.zMax),
    rotY: (Math.random() - 0.5) * 0.2,
  }
}

/* 读取本地存档：老数据没有 y（当时贴片站在桌上），补上桌面高度；没有 scale 补默认值 */
function loadStickers(): Sticker3D[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Sticker3D[]
    return list.map((s) => ({
      ...s,
      y: typeof s.y === 'number' ? s.y : DESK_TOP_Y,
      /* 相机改为室内第一人称后镜头后方看不见：老存档里跑到镜头后面的贴片拉回前方 */
      z: typeof s.z === 'number' ? clamp(s.z, BOUND.zMin, BOUND.zMax) : -1.9,
      scale: typeof s.scale === 'number' ? s.scale : 1,
    }))
  } catch {
    return []
  }
}

/* ---------- 3D 贴片（可自由拖动的悬浮平面；自 MemoryRoom3D 原样搬入） ---------- */
function StickerPlane({
  s,
  picked,
  onPick,
  onDragActive,
  onMove,
  onUpdate,
}: {
  s: Sticker3D
  picked: boolean
  onPick: (id: string) => void
  onDragActive: (active: boolean) => void
  onMove: (p: { x: number; y: number; z: number }) => void
  onUpdate: (id: string, p: { scale?: number; rotY?: number }) => void
}) {
  const group = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)
  /* 拖动状态：mode 'v' = 在贴片所在的竖直平面里拖（上下左右），'h' = 在当前高度的水平面里拖（前后） */
  const drag = useRef<{ mode: 'v' | 'h'; plane: THREE.Plane; offset: THREE.Vector3 } | null>(null)
  const movedRef = useRef(false) // 本次按下后是否真的拖动过（用来抑制拖完误触点击）
  const wheelRef = useRef<((e: WheelEvent) => void) | null>(null) // 拖动期间的滚轮（缩放/旋转）
  const scaleRef = useRef(s.scale || 1)
  const rotRef = useRef(s.rotY) // 旋转累积（闭包里取实时值，连续滚动不丢步）

  useEffect(() => {
    scaleRef.current = s.scale || 1
  }, [s.scale])

  useEffect(() => {
    rotRef.current = s.rotY
  }, [s.rotY])

  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load(s.sticker)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [s.sticker])

  useEffect(() => () => tex.dispose(), [tex])

  useFrame(() => {
    if (!group.current) return
    const g = group.current
    /* 悬停/选中放大倍率 × 用户缩放 */
    const target = (hovered || picked ? 1.12 : 1) * scaleRef.current
    const cur = g.scale.x
    const next = THREE.MathUtils.lerp(cur, target, 0.18)
    g.scale.setScalar(next)

    /* 左右墙吸附：靠近时平滑转到贴墙视角（左墙朝 +x，右墙朝 -x），位置也贴向墙面 */
    const dL = s.x + 3 // 距左墙
    const dR = 3 - s.x // 距右墙
    const nearLeft = dL <= dR
    const d = Math.min(dL, dR)
    const raw = clamp((WALL_SNAP - d) / (WALL_SNAP - 0.08), 0, 1)
    const k = raw * raw * (3 - 2 * raw) // smoothstep，贴得越近越「实」
    const wallRot = nearLeft ? Math.PI / 2 : -Math.PI / 2
    const wallX = nearLeft ? -WALL_INNER_X : WALL_INNER_X
    g.position.x = THREE.MathUtils.lerp(s.x, wallX, k)
    g.rotation.y = THREE.MathUtils.lerp(s.rotY, wallRot, k)
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
    /* 按住左键拖动期间：滚轮缩放贴片（还原原缩放功能）；Shift+滚轮旋转贴片 */
    const onWheel = (e2: WheelEvent) => {
      e2.preventDefault()
      if (e2.shiftKey) {
        /* 旋转：上滚逆时针 / 下滚顺时针，每次约 7°（ref 累积，连续滚动不丢步） */
        rotRef.current += e2.deltaY < 0 ? 0.12 : -0.12
        onUpdate(s.id, { rotY: rotRef.current })
        return
      }
      const f = e2.deltaY < 0 ? 1.08 : 1 / 1.08
      const nextScale = clamp(scaleRef.current * f, STICKER_SCALE.min, STICKER_SCALE.max)
      if (nextScale === scaleRef.current) return
      scaleRef.current = nextScale
      onUpdate(s.id, { scale: nextScale })
    }
    wheelRef.current = onWheel
    window.addEventListener('wheel', onWheel, { passive: false })
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
    if (wheelRef.current) {
      window.removeEventListener('wheel', wheelRef.current)
      wheelRef.current = null
    }
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
      {/* 贴片本体（白边已烘进贴图；直接放入的则是原图整张）
          renderOrder 拉满 + 关闭深度测试：贴片永远渲染在房间家具之上，不被遮挡 */}
      <mesh position={[0, worldH / 2 + 0.004, 0]} renderOrder={999}>
        <planeGeometry args={[worldW, worldH]} />
        <meshBasicMaterial
          map={tex}
          transparent
          toneMapped={false}
          side={THREE.DoubleSide}
          alphaTest={0.02}
          depthTest={false}
        />
      </mesh>
      {/* 正下方承接面上的椭圆软影子（离得越高影子越淡） */}
      <mesh position={[0, shadowY - s.y + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[shadowR, 24]} />
        <meshBasicMaterial color="#6b5436" transparent opacity={shadowOp} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ---------- 3D 物品（物品栏放入的预设建模，可拖动、可点击开卡、可换贴面；原样搬入） ---------- */
function InvItemView({
  item,
  shelfPose,
  picked,
  onPick,
  onDragActive,
  onMove,
  onScale,
}: {
  item: InvItem
  shelfPose?: { x: number; y: number; z: number; rotY: number; scale: number } // 书柜排架位（仅书本）
  picked: boolean
  onPick: (id: string) => void
  onDragActive: (active: boolean) => void
  onMove: (p: { x: number; y: number; z: number }) => void
  onScale: (id: string, scale: number) => void
}) {
  const group = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)
  const drag = useRef<{ mode: 'v' | 'h'; plane: THREE.Plane; offset: THREE.Vector3 } | null>(null)
  const movedRef = useRef(false)
  const wheelRef = useRef<((e: WheelEvent) => void) | null>(null) // 拖动期间的滚轮缩放
  const scaleRef = useRef(item.scale || 1)

  /* 上架的书用排架算出的缩放（受层高/柜深限制），其余用用户缩放 */
  useEffect(() => {
    scaleRef.current = shelfPose ? shelfPose.scale : item.scale || 1
  }, [item.scale, shelfPose])

  useFrame(() => {
    if (!group.current) return
    /* 悬停/选中的放大倍率 × 用户缩放 */
    const target = (hovered || picked ? 1.08 : 1) * scaleRef.current
    const cur = group.current.scale.x
    const next = THREE.MathUtils.lerp(cur, target, 0.18)
    group.current.scale.setScalar(next)
  })

  const def = getPreset(item.preset)

  /* 显示姿态 = 书柜排架位（在书柜里）或原始位置 */
  const pose = shelfPose
    ? { x: shelfPose.x, y: shelfPose.y, z: shelfPose.z, rotY: shelfPose.rotY }
    : { x: item.x, y: item.y, z: item.z, rotY: item.rotY }

  /* 影子：桌面范围内落桌面，否则落地板（书柜里的书影子落在层板上） */
  const overDesk = Math.abs(pose.x) <= DESK_L / 2 + 0.15 && Math.abs(pose.z - DESK_Z) <= 0.4
  const shadowY = shelfPose ? pose.y : overDesk && pose.y >= DESK_TOP_Y - 0.001 ? DESK_TOP_Y : 0.012
  const shadowOp = clamp(0.22 / (1 + Math.max(0, pose.y - shadowY) * 1.6), 0.05, 0.22)

  const setCursor = (c: string) => {
    document.body.style.cursor = c
  }
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
    /* 按住左键拖动期间：滚轮缩放物品。
     * 下限 = 默认大小（1，不能缩得比原始还小）；
     * 上限 = 包围盒最大边达到房间四分之一（ITEM_MAX_DIM=0.75m）时的倍率。 */
    const onWheel = (e2: WheelEvent) => {
      e2.preventDefault()
      const f = e2.deltaY < 0 ? 1.08 : 1 / 1.08
      const maxScale = ITEM_MAX_DIM / def.size
      const nextScale = clamp(scaleRef.current * f, 1, maxScale)
      if (nextScale === scaleRef.current) return
      scaleRef.current = nextScale
      onScale(item.id, nextScale)
    }
    wheelRef.current = onWheel
    window.addEventListener('wheel', onWheel, { passive: false })
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
    if (wheelRef.current) {
      window.removeEventListener('wheel', wheelRef.current)
      wheelRef.current = null
    }
    setCursor(hoveredRef.current ? 'grab' : '')
    onDragActive(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDragActive])

  return (
    <group
      ref={group}
      position={[pose.x, pose.y, pose.z]}
      rotation={[0, pose.rotY, 0]}
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
        if (movedRef.current) {
          movedRef.current = false
          return
        }
        e.stopPropagation()
        onPick(item.id)
      }}
    >
      <ItemModel preset={item.preset} decal={item.decal} />
      {/* 底部软影子 */}
      <mesh position={[0, shadowY - pose.y + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[def.shadowR, 24]} />
        <meshBasicMaterial color="#6b5436" transparent opacity={shadowOp} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ---------- 天气特效（HTML 层，落在卡片虚化背景里；原样搬入） ---------- */
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

function SnowLayer({ count = 36, seed = 13 }: { count?: number; seed?: number }) {
  const flakes = useParticles(count, seed)
  /* 三档雪花（与 3D 房间的三层景深一致）：小·远 → 大·近 */
  const BAND = [
    { size: 2.2, dur: 1.3, sway: 0.7, op: 0.75 },
    { size: 3.8, dur: 1.0, sway: 1.0, op: 0.9 },
    { size: 6.4, dur: 0.66, sway: 1.5, op: 1 },
  ]
  return (
    <div className="snow-layer" aria-hidden>
      {flakes.map((d, i) => {
        const b = BAND[i % 3]
        return (
          <i
            key={i}
            style={
              {
                left: `${d.x}%`,
                width: b.size,
                height: b.size,
                '--op': d.op * b.op,
                '--sway': `${d.sway * b.sway}px`,
                animationDuration: `${d.durS * b.dur}s`,
                animationDelay: `${d.delayS}s`,
              } as React.CSSProperties
            }
          />
        )
      })}
    </div>
  )
}

/* 晴天：暖阳光晕 + 几道缓慢摆动的斜射光带 */
function SunRayLayer({ seed = 21 }: { seed?: number }) {
  const rays = useParticles(3, seed)
  return (
    <div className="sun-layer" aria-hidden>
      <div className="glow" />
      {rays.map((d, i) => (
        <div
          key={i}
          className="ray"
          style={{
            left: `${4 + d.x * 0.62}%`,
            width: `${12 + d.size * 3}%`,
            animationDuration: `${d.durS * 1.15}s`,
            animationDelay: `${d.delayS}s`,
          }}
        />
      ))}
    </div>
  )
}

/* 多云：灰云团缓慢飘过 + 轻微压暗的底色 */
function CloudLayer({ count = 6, seed = 31 }: { count?: number; seed?: number }) {
  const clouds = useParticles(count, seed)
  return (
    <div className="cloud-layer" aria-hidden>
      {clouds.map((d, i) => {
        const w = 58 + d.size * 16
        return (
          <i
            key={i}
            style={
              {
                top: `${(i * 97) % 68}%`,
                width: w,
                height: w * 0.42,
                '--op': d.op * 0.8,
                '--dist': '640px',
                animationDuration: `${d.durS * 2.4}s`,
                animationDelay: `${d.delayS}s`,
              } as React.CSSProperties
            }
          />
        )
      })}
    </div>
  )
}

/* ---------- 上传后的三选一弹窗（原样搬入） ---------- */
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

/* ---------- 手动截取编辑器：在图上圈一块，圈外变透明（原样搬入） ---------- */
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

/* ---------- 回忆卡片（原样搬入） ---------- */
function MemoryCard({
  sticker,
  weather,
  onWeather,
  onSave,
  onClose,
  onRemove,
  onRetexture,
}: {
  sticker: Sticker3D
  weather: string
  onWeather: (w: string) => void
  onSave: (meta: StickerMeta) => void
  onClose: () => void
  onRemove: () => void
  onRetexture?: () => void
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
        <div className={`card-photo checker wx-${weather}`}>
          <img className="card-photo-blur" src={sticker.src} alt="" aria-hidden />
          {weather === 'rain' && <RainLayer count={46} />}
          {weather === 'snow' && <SnowLayer count={36} />}
          {weather === 'sunny' && <SunRayLayer />}
          {weather === 'cloudy' && <CloudLayer />}
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
          {onRetexture && (
            <button className="btn-ghost" onClick={onRetexture}>
              🖼 换张贴图
            </button>
          )}
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

/* ================================================================
 * useItemPlacement：物品/贴片的全部状态与操作（自 MemoryRoom3D 主组件原样搬入）
 * 天气状态不在这里（天气是背景与物品的联动纽带，由父级持有并通过参数传入）。
 * ================================================================ */
export function useItemPlacement({ weather, onWeatherChange }: { weather: string; onWeatherChange: (w: string) => void }) {
  const [stickers, setStickers] = useState<Sticker3D[]>(loadStickers)
  const [items, setItems] = useState<InvItem[]>(loadItems)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeKind, setActiveKind] = useState<'sticker' | 'item'>('sticker')
  const [cardOpen, setCardOpen] = useState(false)
  const [busy, setBusy] = useState(false) // 正在自动抠图
  const [prog, setProg] = useState<{ p: number; label: string } | null>(null)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<{ src: string; name: string } | null>(null) // 待选择的图片
  const [pendingTarget, setPendingTarget] = useState<'sticker' | 'frame'>('sticker') // 图片去向：贴片 or 相框物品
  const [cropMode, setCropMode] = useState(false) // 三选一弹窗 → 手动截取编辑器
  const [draggingId, setDraggingId] = useState<string | null>(null) // 正在拖动的贴片/物品
  const retextureRef = useRef<HTMLInputElement>(null) // 物品换贴面的文件选择

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stickers))
    } catch {
      /* 忽略容量错误 */
    }
  }, [stickers])

  useEffect(() => {
    try {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
    } catch {
      /* 忽略容量错误 */
    }
  }, [items])

  const active = activeKind === 'item' ? items.find((i) => i.id === activeId) || null : stickers.find((s) => s.id === activeId) || null
  const activeItem = activeKind === 'item' ? (active as InvItem) : null
  const cardSticker = activeItem ? itemAsSticker(activeItem) : (active as Sticker3D)

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

  /* 读文件 → dataURL 的公共小工具 */
  const readFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => reject(new Error('读取文件失败'))
      r.readAsDataURL(file)
    })

  /* 选择文件 → 读成 dataURL → 弹出三选一窗口（目标由入口决定：贴片 / 相框物品） */
  const onFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files || [])[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    try {
      const src = await readFile(file)
      setPendingTarget('sticker')
      setPending({ src, name: file.name })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '读取文件失败')
    }
  }, [])

  /* 图片 → 风格化贴面 → 相框物品（「＋ 添加图片」及三选一的相框分支共用） */
  const frameFromSrc = useCallback(async (src: string, name?: string) => {
    const face = await stylizeDecal(src, getPreset('frame').aspect)
    setItems((list) => [
      ...list,
      {
        id: `i${Date.now()}_${uid()}`,
        preset: 'frame',
        ...spawnItemPose(),
        decal: face.dataUrl,
        meta: name ? { name } : null,
      },
    ])
  }, [])

  /* 物品栏「＋ 添加图片」：图片 → 风格化贴面 → 相框建模（把照片变成一件物品） */
  const onAddImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = (e.target.files || [])[0]
      e.target.value = ''
      if (!file) return
      setErr('')
      try {
        const src = await readFile(file)
        await frameFromSrc(src, file.name.replace(/\.[^.]+$/, ''))
      } catch (e2) {
        setErr(e2 instanceof Error ? e2.message : '添加失败，请重试')
      }
    },
    [frameFromSrc]
  )

  /* 从物品栏选择预设 → 放到桌上 */
  const spawnItem = useCallback((presetId: string) => {
    setItems((list) => [
      ...list,
      { id: `i${Date.now()}_${uid()}`, preset: presetId, ...spawnItemPose(), decal: null, meta: null },
    ])
  }, [])

  const closePending = useCallback(() => {
    setPending(null)
    setCropMode(false)
  }, [])

  /* 选项 ① 自动扣图（沿用之前的 AI 抠图 + 白边流程；相框目标则直接风格化贴面） */
  const runAuto = useCallback(async () => {
    if (!pending) return
    const src = pending.src
    if (pendingTarget === 'frame') {
      closePending()
      setErr('')
      try {
        await frameFromSrc(src)
      } catch (e3) {
        setErr(e3 instanceof Error ? e3.message : '添加失败，请重试')
      }
      return
    }
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
  }, [pending, pendingTarget, closePending, addSticker, frameFromSrc])

  /* 选项 ② 手动截取：切到圈选编辑器 */
  const runManual = useCallback(() => {
    setCropMode(true)
  }, [])

  /* 选项 ③ 直接放入：原图整张放进去（和之前的直接放一样，只是压一下尺寸） */
  const runDirect = useCallback(async () => {
    if (!pending) return
    const src = pending.src
    if (pendingTarget === 'frame') {
      closePending()
      setErr('')
      try {
        await frameFromSrc(src)
      } catch (e3) {
        setErr(e3 instanceof Error ? e3.message : '添加失败，请重试')
      }
      return
    }
    closePending()
    setErr('')
    try {
      const flat = await flattenImage(src)
      addSticker(src, flat)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '放入失败，请重试')
    }
  }, [pending, pendingTarget, closePending, addSticker, frameFromSrc])

  /* 手动截取完成 → 白边 → 新增贴片（相框目标则直接风格化贴面） */
  const onCropDone = useCallback(
    (cut: { dataUrl: string; width: number; height: number }) => {
      closePending()
      setErr('')
      if (pendingTarget === 'frame') {
        frameFromSrc(cut.dataUrl).catch(() => setErr('添加失败，请重试'))
        return
      }
      addStickerBorder(cut.dataUrl)
        .then((bordered) => addSticker(cut.dataUrl, bordered))
        .catch(() => addSticker(cut.dataUrl, cut)) // 白边失败就用原图截取结果兜底
    },
    [closePending, addSticker, pendingTarget, frameFromSrc]
  )

  const saveMeta = useCallback(
    (meta: StickerMeta) => {
      if (!activeId) return
      if (activeKind === 'item') setItems((list) => list.map((i) => (i.id === activeId ? { ...i, meta } : i)))
      else setStickers((list) => list.map((s) => (s.id === activeId ? { ...s, meta } : s)))
      setCardOpen(false)
      setActiveId(null)
    },
    [activeId, activeKind]
  )

  const removeSticker = useCallback(
    (id: string) => {
      if (activeKind === 'item') setItems((list) => list.filter((i) => i.id !== id))
      else setStickers((list) => list.filter((s) => s.id !== id))
      setCardOpen(false)
      setActiveId(null)
    },
    [activeKind]
  )

  const pick = useCallback((kind: 'sticker' | 'item', id: string) => {
    setActiveKind(kind)
    setActiveId(id)
    setCardOpen(true)
  }, [])

  /* 关闭卡片（清空选中） */
  const closeCard = useCallback(() => {
    setCardOpen(false)
    setActiveId(null)
  }, [])

  /* 拖动开始/结束：通知父级暂停相机（同屏只允许一个拖动源） */
  const markDrag = useCallback((kind: 'sticker' | 'item', id: string, on: boolean) => {
    setDraggingId((cur) => (on ? id : cur === id ? null : cur))
    void kind
  }, [])

  /* 物品换贴面：选图 → 风格化 → 更新 decal（卡片保持打开） */
  const onRetextureFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = (e.target.files || [])[0]
      e.target.value = ''
      if (!file || !activeItem) return
      setErr('')
      try {
        const src = await readFile(file)
        const def = getPreset(activeItem.preset)
        /* 满幅预设（书本）：图片铺满整个贴面区；其他预设保留米色边框 */
        const face = await stylizeDecal(src, def.aspect, { full: !!def.full })
        setItems((list) => list.map((i) => (i.id === activeItem.id ? { ...i, decal: face.dataUrl } : i)))
      } catch (e2) {
        setErr(e2 instanceof Error ? e2.message : '贴图失败，请重试')
      }
    },
    [activeItem]
  )

  return {
    // 状态
    weather,
    stickers,
    items,
    activeId,
    activeKind,
    active,
    activeItem,
    cardSticker,
    cardOpen,
    busy,
    prog,
    err,
    pending,
    cropMode,
    dragging: !!draggingId,
    retextureRef,
    // 操作
    setStickers,
    setItems,
    setCropMode,
    closeCard,
    onFiles,
    onAddImageFile,
    spawnItem,
    runAuto,
    runManual,
    runDirect,
    closePending,
    onCropDone,
    saveMeta,
    removeSticker,
    pick,
    markDrag,
    onRetextureFile,
    onWeatherChange,
  }
}

export type ItemPlacementApi = ReturnType<typeof useItemPlacement>

/* ---------- 3D 部分：贴片 + 物品（挂在 RoomBackground 的 Canvas 里） ---------- */
export function ItemPlacementScene({ hp }: { hp: ItemPlacementApi }) {
  /* 书柜排架：所有书一起算，保证四层都能放且不互相重叠 */
  const shelfLayout = useMemo(() => computeShelfLayout(hp.items), [hp.items])
  return (
    <>
      {hp.stickers.map((s) => (
        <StickerPlane
          key={s.id}
          s={s}
          picked={hp.cardOpen && hp.activeId === s.id && hp.activeKind === 'sticker'}
          onPick={(id) => hp.pick('sticker', id)}
          onDragActive={(on) => hp.markDrag('sticker', s.id, on)}
          onMove={(p) => hp.setStickers((list) => list.map((x) => (x.id === s.id ? { ...x, ...p } : x)))}
          onUpdate={(id, p) => hp.setStickers((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)))}
        />
      ))}
      {hp.items.map((it) => (
        <InvItemView
          key={it.id}
          item={it}
          shelfPose={shelfLayout.get(it.id)}
          picked={hp.cardOpen && hp.activeId === it.id && hp.activeKind === 'item'}
          onPick={(id) => hp.pick('item', id)}
          onDragActive={(on) => hp.markDrag('item', it.id, on)}
          onMove={(p) => hp.setItems((list) => list.map((x) => (x.id === it.id ? { ...x, ...p } : x)))}
          onScale={(id, scale) => hp.setItems((list) => list.map((x) => (x.id === id ? { ...x, scale } : x)))}
        />
      ))}
    </>
  )
}

/* ---------- HTML 部分：物品栏 / 上传 / 弹窗 / 进度 / 卡片（绝对定位 overlay） ---------- */
export function ItemPlacementOverlay({ hp }: { hp: ItemPlacementApi }) {
  return (
    <>
      {/* 物品栏：预设建模一键放入 + 图片变相框物品 */}
      <div className="mr3d-inventory">
        <span className="inv-title">物品栏</span>
        <label className="inv-chip inv-add">
          ＋ 添加图片
          <input type="file" accept="image/*" hidden onChange={hp.onAddImageFile} />
        </label>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="inv-chip" onClick={() => hp.spawnItem(p.id)} title={`放入${p.label}`}>
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {/* 上传按钮（单张，选完弹三选一） */}
      <label className="mr3d-upload">
        ＋ 放一件物品
        <input type="file" accept="image/*" hidden onChange={hp.onFiles} />
      </label>

      {/* 操作提示 */}
      <p className="mr3d-hint">拖动物品/贴图随意移动 · 按住 Shift 拖动可前后调整远近 · 按住左键滚动滚轮缩放（Shift+滚轮旋转贴图） · 书本拖进书柜会自动竖着上架，多本同层并排 · 贴图靠近左右墙会自动贴墙吸附 · 点击打开回忆</p>

      {/* 三选一弹窗 */}
      {hp.pending && !hp.cropMode && (
        <ChoiceModal src={hp.pending.src} onAuto={hp.runAuto} onManual={hp.runManual} onDirect={hp.runDirect} onClose={hp.closePending} />
      )}

      {/* 手动截取编辑器 */}
      {hp.pending && hp.cropMode && (
        <LassoEditor src={hp.pending.src} onBack={() => hp.setCropMode(false)} onClose={hp.closePending} onDone={hp.onCropDone} />
      )}

      {/* 自动抠图进度 */}
      {hp.busy && hp.prog && (
        <div className="mr3d-progress-mask">
          <div className="mr3d-progress-panel">
            <h3>正在做成贴纸</h3>
            <div className="choice-progress">
              <i style={{ width: `${Math.round(hp.prog.p * 100)}%` }} />
            </div>
            <p>
              {hp.prog.label} {Math.round(hp.prog.p * 100)}%
            </p>
            {hp.err && <p className="mr3d-err">{hp.err}</p>}
          </div>
        </div>
      )}
      {!hp.busy && hp.err && <p className="mr3d-err mr3d-err-float">{hp.err}</p>}

      {/* 回忆卡片（贴片与物品共用；物品多一个「换张贴图」入口） */}
      {hp.active && hp.cardOpen && (
        <MemoryCard
          sticker={hp.cardSticker}
          weather={hp.weather}
          onWeather={hp.onWeatherChange}
          onSave={hp.saveMeta}
          onClose={() => hp.closeCard()}          onRemove={() => hp.removeSticker(hp.active!.id)}
          onRetexture={hp.activeItem ? () => hp.retextureRef.current?.click() : undefined}
        />
      )}

      {/* 物品换贴面的隐藏文件选择 */}
      <input type="file" accept="image/*" hidden ref={hp.retextureRef} onChange={hp.onRetextureFile} />
    </>
  )
}
