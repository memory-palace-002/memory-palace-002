import type { MemoryBox } from '../data/boxes';
import { bookDims } from '../lib/dims';
import { SHELF_GAP } from '../lib/anim';
import { useBookshelf } from '../store/bookshelf';
import { Book } from './Book';

const BOARD_TOPS = [0.5725, 1.1025, 1.6325];
const SHELF_Z = -2.3;
const CASE_WIDTH = 1.58; // 书架可用宽度

/** 盒子按层排布: ≤8 本两排放下, 更多时均匀分三排(新抓取的书自动上架) */
function splitRows(all: MemoryBox[]): MemoryBox[][] {
  if (all.length <= 8) {
    return [all.slice(0, 4), all.slice(4, 8)];
  }
  const n = Math.ceil(all.length / 3);
  return [all.slice(0, n), all.slice(n, 2 * n), all.slice(2 * n)];
}

export function ShelfRows() {
  const boxes = useBookshelf((s) => s.boxes);
  const rows = splitRows(boxes);
  return (
    <group>
      {rows.map((row, r) => {
        const totalT = row.reduce((s, b) => s + bookDims(b).t, 0);
        const gap =
          row.length > 1
            ? Math.min(SHELF_GAP, Math.max(0.008, (CASE_WIDTH - totalT) / (row.length - 1)))
            : 0;
        const total = totalT + gap * (row.length - 1);
        let cursor = -total / 2;
        return (
          <group key={r}>
            {row.map((box) => {
              const dims = bookDims(box);
              const x = cursor + dims.t / 2;
              cursor += dims.t + gap;
              return (
                <Book
                  key={box.id}
                  box={box}
                  position={[x, BOARD_TOPS[r] + dims.h / 2, SHELF_Z]}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
