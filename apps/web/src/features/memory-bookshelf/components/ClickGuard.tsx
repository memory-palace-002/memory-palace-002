import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { pointerDown } from '../lib/pointer'

/** 在 canvas 上记录 pointerdown 坐标, 供 isTap 区分点击与拖拽 */
export function ClickGuard() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const onDown = (e: PointerEvent) => pointerDown(e.clientX, e.clientY)
    el.addEventListener('pointerdown', onDown)
    return () => el.removeEventListener('pointerdown', onDown)
  }, [gl])
  return null
}
