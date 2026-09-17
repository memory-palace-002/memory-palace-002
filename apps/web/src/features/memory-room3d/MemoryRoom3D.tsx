/**
 * MemoryRoom3D —— 3D 回忆房间（父级组装器，解耦重构产物）
 *
 * 职责只有一个：把两个独立模块组装起来，并持有「天气」这个联动纽带——
 *   - <RoomBackground>    房间背景（Canvas / 房间模型 / 天气灯光 / 视角控制）
 *                          → 归 feature-room-background 分支维护
 *   - <ItemPlacement*>    物品摆放（贴片 + 物品的增删改、拖拽、AI 抠图、回忆卡片）
 *                          → 归 feature-item-placement 分支维护
 *
 * 联动方式：天气状态在父级；卡片里选天气 → onWeatherChange 更新父级 → 背景与卡片同步变化。
 *
 * 依赖：@huggingface/transformers（模型在 public/models/BritishWerewolf/U-2-Netp/）
 */
import { useState } from 'react'
import RoomBackground from './RoomBackground'
import { useItemPlacement, ItemPlacementScene, ItemPlacementOverlay } from './ItemPlacement'
import './MemoryRoom3D.css'

export default function MemoryRoom3D() {
  /* 天气：背景（窗外天空/灯光）与物品（回忆卡片）的联动纽带，由父级持有 */
  const [weather, setWeather] = useState('')

  /* 物品/贴片的全部状态与操作 */
  const hp = useItemPlacement({ weather, onWeatherChange: setWeather })

  return (
    <div className="mr3d-root">
      {/* 房间背景（Canvas 在这里）；物品通过 children 注入到 Canvas 内部 */}
      <RoomBackground weather={weather} cameraPaused={hp.dragging}>
        <ItemPlacementScene hp={hp} />
      </RoomBackground>

      {/* 物品摆放的 HTML 层（物品栏 / 上传 / 弹窗 / 回忆卡片） */}
      <ItemPlacementOverlay hp={hp} />
    </div>
  )
}
