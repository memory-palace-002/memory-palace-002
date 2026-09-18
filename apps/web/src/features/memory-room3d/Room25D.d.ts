import type { FC } from 'react'

/** 桌面顶面高度（摆放贴片用） */
export const DESK_TOP_Y: number
/** 桌面所在的 z */
export const DESK_Z: number
/** 桌面长度 */
export const DESK_L: number

/** 书桌右侧抽屉柜「最上面一格」——可拉出的那一格（镜头俯视位由它推导） */
export const DESK_DRAWER: {
  x: number
  y: number
  z: number
  w: number
  h: number
  travel: number
}

/**
 * 暖色 3D 房间模型（不含 Canvas）。
 * weather: 'sunny' | 'cloudy' | 'rain' | 'snow' | ''
 * season : 'spring' | 'summer' | 'autumn' | 'winter' | ''（'' = 跟随天气天空）
 * drawerOpen / onDrawerToggle：书桌右侧抽屉柜最上层是否拉出 / 点抽屉的开合回调
 * framePhotos：照片墙里已插入的图片（dataURL 数组，前 5 张贴到右墙相框上）
 * onFrameClick：点击任意相框的回调（RoomBackground 用它切到 'wall' 照片墙阶段）
 */
export const Room25DModel: FC<{
  weather?: string
  season?: string
  drawerOpen?: boolean
  onDrawerToggle?: () => void
  framePhotos?: string[]
  onFrameClick?: (index: number) => void
} & Record<string, unknown>>

/** 右墙相框所在 x（照片墙镜头以它为基准推导，见 RoomBackground 的 WALL_VIEW） */
export const WALL_FRAME_X: number
/** 右墙相框的错落排布（z 为墙面横向坐标，y 为高度） */
export const WALL_FRAMES: { z: number; y: number; w: number; h: number }[]

/** 四季配置（窗外贴图 URL + 光影参数），供左上角悬浮切换按钮使用 */
export const SEASON_OPTIONS: {
  id: 'spring' | 'summer' | 'autumn' | 'winter'
  label: string
  url: string
  /** 窗光颜色/强度 */
  light: string
  intensity: number
  /** 环境光强度/颜色 + 主光强度 */
  ambient: number
  ambientColor: string
  dir: number
  /** 画布底色（房间外的空隙） */
  bg: string
}[]

/** 房间场景（自带 Canvas + 相机 + 灯光） */
declare const Room25DScene: FC<{ weather?: string }>
export default Room25DScene
