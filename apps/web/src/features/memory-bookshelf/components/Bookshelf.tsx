import type { MemoryBox } from '../data/boxes'
import { bookDims } from '../lib/dims'
import { SHELF_GAP } from '../lib/anim'
import { useBookshelf } from '../store/bookshelf'
import { Book } from './Book'

/* ---------- 排架常量：全部来自本仓库 Room25D.jsx 的 Bookshelf（只读参考，不改背景文件） ----------
 * 与 ItemPlacement.tsx 的 SHELF 常量同源：
 *   柜体中心 cx = 2.075；层板 y = [0.55, 1.05, 1.55, 2.05]，板厚 0.035 → 顶面 = y + 0.0175
 *   书竖放后的 z = -2.81（ItemPlacement 的 SHELF.zPlace）；柜内可用半宽 0.5
 * 记忆书自上而下占三层（2.05 / 1.55 / 1.05，居中摆放）；
 * 其中 y=2.05 / 1.55 两层已在 ItemPlacement 的 BOOKSHELF_RESERVED_ROWS 整层预留，
 * 用户的放书排架会自动避开，两边永不穿模。 */
const ROW_Y = [2.05, 1.55, 1.05] // 记忆书第 1/2/3 排对应的柜层层板 y
const BOARD_TOP = 0.0175 // 层板半厚（顶面偏移）
const SHELF_CX = 2.075 // 柜体中心 x
const Z_PLACE = -2.81 // 书竖放后的 z
const ROW_WIDTH = 0.9 // 每排可用宽度（内腔 1.0，留边）

/** 盒子按层排布: ≤8 本两排放下, 更多时均匀分三排(新抓取的书自动上架) */
function splitRows(all: MemoryBox[]): MemoryBox[][] {
  if (all.length <= 8) {
    return [all.slice(0, 4), all.slice(4, 8)]
  }
  const n = Math.ceil(all.length / 3)
  return [all.slice(0, n), all.slice(n, 2 * n), all.slice(2 * n)]
}

export function MemoryShelfRows() {
  const boxes = useBookshelf((s) => s.boxes)
  const rows = splitRows(boxes)
  return (
    <group>
      {rows.map((row, r) => {
        if (r >= ROW_Y.length || row.length === 0) return null
        const totalT = row.reduce((sum, b) => sum + bookDims(b).t, 0)
        const gap =
          row.length > 1
            ? Math.min(SHELF_GAP, Math.max(0.008, (ROW_WIDTH - totalT) / (row.length - 1)))
            : 0
        const total = totalT + gap * (row.length - 1)
        let cursor = -total / 2
        return (
          <group key={r}>
            {row.map((box) => {
              const dims = bookDims(box)
              const x = SHELF_CX + cursor + dims.t / 2
              cursor += dims.t + gap
              return (
                <Book
                  key={box.id}
                  box={box}
                  position={[x, ROW_Y[r] + BOARD_TOP + dims.h / 2, Z_PLACE]}
                />
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
