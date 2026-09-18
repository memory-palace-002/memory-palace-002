export interface Transform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
}

export const DEFAULT_TRANSFORM: Transform = {
  position: [0, 0.45, 0],
  rotation: [0, 0, 0],
  scale: 1,
}