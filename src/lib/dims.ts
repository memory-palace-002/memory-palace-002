import type { MemoryBox } from '../data/boxes';
import { seededRand } from './anim';

/** 由盒子数据推导书本尺寸: 厚度随内容数增长, 高低带稳定随机, 受大小档位缩放 */
export function bookDims(box: MemoryBox) {
  const size = box.sizeScale ?? 1;
  const t = 0.05 + Math.min(box.items.length, 10) * 0.0035;
  const h = (0.3 + (seededRand(box.id) + 1) * 0.012) * size;
  const d = 0.24 + (seededRand(box.id, 1) + 1) * 0.012;
  return { t, h, d };
}
