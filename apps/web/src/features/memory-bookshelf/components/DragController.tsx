import { useEffect } from 'react'
import { useBookshelf } from '../store/bookshelf'
import { dragRuntime, dropAnim } from '../lib/drag'

/**
 * 记忆书柜的全局拖拽收尾（移植自队友项目）。
 * 与原项目的差异：本仓库的书柜地板就是 y=0 的房间地板，
 * 物件松手后统一落到地板（不再吸附她原来书柜的层板——本仓库的层板归用户放书用）。
 */
export function DragController() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => useBookshelf.getState().moveDrag(e.clientX, e.clientY)

    const onUp = () => {
      const d = useBookshelf.getState().drag
      if (!d) return

      if (d.active) {
        const p = dragRuntime.pos

        // 落到房间地板（y=0）
        dropAnim.active = true
        dropAnim.startTime = performance.now()
        dropAnim.from.copy(dragRuntime.pos)
        dropAnim.to.set(p.x, 0, p.z)

        useBookshelf.getState().endDrag(true, [p.x, 0, p.z])
      } else {
        useBookshelf.getState().endDrag(false)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return null
}
