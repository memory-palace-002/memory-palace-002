import { useEffect } from 'react';
import { useBookshelf } from '../store/bookshelf';
import { dragRuntime, dropAnim } from '../lib/drag';

export function DragController() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => useBookshelf.getState().moveDrag(e.clientX, e.clientY);

    const onUp = () => {
      const d = useBookshelf.getState().drag;
      if (!d) return;

      if (d.active) {
        const p = dragRuntime.pos;

        const BOARD_TOPS = [0.5725, 1.1025, 1.6325];
        let snapY = 0;
        for (const top of BOARD_TOPS) {
          if (Math.abs(p.y - top) < 0.15) {
            snapY = top;
            break;
          }
        }

        // 开启落点动画：从当前位置滑到目标位置
        dropAnim.active = true;
        dropAnim.startTime = performance.now();
        dropAnim.from.copy(dragRuntime.pos);
        dropAnim.to.set(p.x, snapY, p.z);

        useBookshelf.getState().endDrag(true, [p.x, snapY, p.z]);
      } else {
        useBookshelf.getState().endDrag(false);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return null;
}