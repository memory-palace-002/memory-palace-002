import type { CapturePayload } from '../data/boxes'
import { useBookshelf } from '../store/bookshelf'

/**
 * 队友模块接入点: 拍照 / 2.5D 扫描 / 平面抠图 / 文字 / 语音
 * 调用后自动新建一本以当天日期命名的书, 并把素材按类型存入。
 * 任何模块（例如扫码模块 features/scan）都可以直接调用:
 *   import { ingestCapture } from '@/features/memory-bookshelf/lib/ingest'
 */
export function ingestCapture(payload: CapturePayload): void {
  useBookshelf.getState().capture(payload)
}
