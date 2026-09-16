import { useRef } from 'react'
export function usePickInteraction() {
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const recordDown = (x: number, y: number) => { downPos.current = { x, y } }
  const isTap = (x: number, y: number) => {
    if (!downPos.current) return true
    const dx = x - downPos.current.x
    const dy = y - downPos.current.y
    const dist = Math.hypot(dx, dy)
    downPos.current = null
    return dist < 8
  }
  return { recordDown, isTap }
}