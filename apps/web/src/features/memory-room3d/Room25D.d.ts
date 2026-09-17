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
 * drawerOpen / onDrawerToggle：书桌右侧抽屉柜最上层是否拉出 / 点抽屉的开合回调
 */
export const Room25DModel: FC<{
  weather?: string
  drawerOpen?: boolean
  onDrawerToggle?: () => void
} & Record<string, unknown>>

/** 房间场景（自带 Canvas + 相机 + 灯光） */
declare const Room25DScene: FC<{ weather?: string }>
export default Room25DScene
