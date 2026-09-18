/**
 * MemoryBookshelf —— 记忆书柜模块入口（移植自队友的 memory-bookshelf 项目）
 *
 * 形态：**挂进 3D 回忆房间的同一个 Canvas**，不走路由、不建第二个场景。
 *   - <MemoryBookshelfScene />   3D 部分：她的记忆书排到你柜子的上三层 +
 *                                取出物件层 + 点击基准记录（挂 RoomBackground children）
 *   - <MemoryBookshelfOverlay /> DOM 部分：关闭/翻页/重命名/详情 + 全局拖拽收尾 +
 *                                阅读时的压暗遮罩（挂 MemoryRoom3D 根节点）
 *
 * 与原项目的差异：
 *   - 相机不接管：RoomBackground 的室内机位固定不动，书飞到机位正前方的展示位
 *     （store 的 STAGE_BOOK）；阅读期间 cameraPaused 冻结转头。
 *   - 灯光不接管：本仓库灯光归天气/四季系统管，阅读氛围改用 DOM 压暗遮罩（.bksh-dim）。
 *   - 样式作用域化：全部类名加 bksh- 前缀，不再有全局 reset。
 */
import { Suspense } from 'react'
import { MemoryShelfRows } from './components/Bookshelf'
import { ExtractedLayer } from './components/ExtractedLayer'
import { ClickGuard } from './components/ClickGuard'
import { Overlay } from './components/Overlay'
import { DragController } from './components/DragController'
import { useBookshelf } from './store/bookshelf'
import './bookshelf.css'

/** 3D 部分：挂在 RoomBackground 的 children（Canvas 内部） */
export function MemoryBookshelfScene() {
  return (
    <Suspense fallback={null}>
      <MemoryShelfRows />
      <ExtractedLayer />
      <ClickGuard />
    </Suspense>
  )
}

/** DOM 部分：挂在 MemoryRoom3D 根节点（Canvas 外面，绝对定位 overlay） */
export function MemoryBookshelfOverlay() {
  const phase = useBookshelf((s) => s.phase)
  return (
    <>
      {/* 阅读时的氛围压暗（四周虚化变暗、中间给摊开的书留清晰区），不拦截指针 */}
      {phase !== 'closed' && <div className="bksh-dim" aria-hidden />}
      <Overlay />
      <DragController />
    </>
  )
}
