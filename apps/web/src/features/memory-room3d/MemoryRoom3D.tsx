/**
 * MemoryRoom3D —— 3D 回忆房间（父级组装器，解耦重构产物）
 *
 * 职责只有一个：把各个独立模块组装起来，并持有跨模块的联动状态——
 *   - <RoomBackground>    房间背景（Canvas / 房间模型 / 天气灯光 / 视角控制）
 *                          → 归 feature-room-background 分支维护
 *   - <ItemPlacement*>    物品摆放（贴片 + 物品的增删改、拖拽、AI 抠图、回忆卡片）
 *                          → 归 feature-item-placement 分支维护
 *   - <RoomToolbar>       左侧悬浮功能栏（四季 / 物品栏两个可展开面板）
 *   - useScanSession      跨设备扫描（手机扫码拍真实物品 → 落到房间当贴片）
 *                          → 归 feature-integrate-scan，实现全部收在 features/scan/
 *
 * 联动方式：天气与四季状态都在父级；工具面板/背景读同一份状态，改一处两边同步。
 * 扫描资产的落地方式：交给 hp.addSticker —— 即物品摆放模块自己的「统一新增贴片入口」，
 * 所以扫到的物品天然拥有拖拽、滚轮缩放、墙面吸附、落影、回忆卡、本地存档的全套能力，
 * 扫描模块不需要、也不应该自己实现一套拖拽。
 *
 * 依赖：@huggingface/transformers（模型在 public/models/BritishWerewolf/U-2-Netp/）
 */
import { useCallback, useState } from 'react'
import RoomBackground from './RoomBackground'
import RoomToolbar from './RoomToolbar'
import { SEASON_OPTIONS } from './Room25D'
import { useItemPlacement, ItemPlacementScene, ItemPlacementOverlay } from './ItemPlacement'
import { useScanSession } from '../scan/useScanSession'
import QrModal from '../scan/components/QrModal'
/* 记忆书柜（队友项目移植）：她的记忆书挂在同一个房间的书柜上，
 * 交互（悬停抽书翻面 / 点击摊开阅读 / 拖物件取出落地）原样保留 */
import { MemoryBookshelfScene, MemoryBookshelfOverlay } from '../memory-bookshelf/MemoryBookshelf'
import { useBookshelf } from '../memory-bookshelf/store/bookshelf'
import './MemoryRoom3D.css'

type SeasonId = (typeof SEASON_OPTIONS)[number]['id']

export default function MemoryRoom3D() {
  /* 天气：背景（窗外天空/灯光）与物品（回忆卡片）的联动纽带，由父级持有 */
  const [weather, setWeather] = useState('')
  /* 四季：'' = 关（窗外走天气天空）；选中某季 → 窗外换贴图 + 光线明暗联动。
   * 切换入口在左侧悬浮功能栏 RoomToolbar。 */
  const [season, setSeason] = useState<SeasonId | ''>('')

  /* 物品/贴片的全部状态与操作 */
  const hp = useItemPlacement({ weather, onWeatherChange: setWeather })

  /* 扫码资产入房：src 是云端原图（回忆卡片用），img 是裁好透明留白的贴片纹理 */
  const addScannedAsset = useCallback(
    (src: string, img: { dataUrl: string; width: number; height: number }) => {
      hp.addSticker(src, img)
    },
    [hp.addSticker]
  )
  const scan = useScanSession(addScannedAsset)

  /* 记忆书柜的「占用镜头」状态：摊开阅读中或拖拽取出物件时，冻结室内转头 */
  const bkBusy = useBookshelf((s) => s.phase !== 'closed' || !!s.drag)

  return (
    <div className="mr3d-root">
      {/* 房间背景（Canvas 在这里）；物品通过 children 注入到 Canvas 内部。
          cameraPaused：物品拖拽 或 记忆书柜阅读/拖拽中 → 暂停转头 */}
      <RoomBackground weather={weather} season={season} cameraPaused={hp.dragging || bkBusy}>
        <ItemPlacementScene hp={hp} />
        <MemoryBookshelfScene />
      </RoomBackground>

      {/* 物品摆放的 HTML 层（弹窗 / 回忆卡片 / 进度） */}
      <ItemPlacementOverlay hp={hp} />

      {/* 记忆书柜的 HTML 层（关闭/翻页/详情 + 拖拽收尾 + 阅读压暗遮罩） */}
      <MemoryBookshelfOverlay />

      {/* 左侧悬浮功能栏：四季 + 物品栏（扫码入口在物品栏面板内） */}
      <RoomToolbar season={season} onSeasonChange={setSeason} hp={hp} scan={scan} />

      {/* 扫码二维码弹窗（scan 模块自带组件，样式走 scan.css）
          scanUrlScope 用来告诉用户这个二维码手机能不能打开 */}
      {scan.qrOpen && scan.sessionId && (
        <QrModal
          scanUrl={scan.scanUrl}
          sessionId={scan.sessionId}
          scanUrlScope={scan.scanUrlScope}
          onClose={scan.closeQr}
        />
      )}
    </div>
  )
}
