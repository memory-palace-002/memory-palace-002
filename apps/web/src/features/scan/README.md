# scan 模块（feature-integrate-scan）

真实物品扫描 · 跨设备协同模块。所有扫描相关代码集中在本目录，对其他模块零侵入。

## 当前能力（v2）

| 阶段 | 实现 |
|---|---|
| 图像处理 | **Level 1：浏览器端 AI 抠图**（U²-Netp，WASM，模型 4.4MB 随站点分发）→ 柔和插画滤镜 → WebP 输出 |
| 降级兜底 | 模型加载/推理失败或滤镜超时（3s）→ 自动回退 **Level 0**（居中裁剪），不报错白屏 |
| 展示包装 | 柔和右下投影 + 等距网格底板 + 缩放（滚轮 / 拖拽手柄）由宿主的展示层（CSS）负责 |

## 对外 API（唯一集成面）

其他模块（如「物品摆放」）**只允许** import `api/scanAssetService.js`：

```js
import {
  createScanSession,   // () => string                 生成扫码会话 ID
  buildScanUrl,        // (sessionId) => string        手机端拍摄页地址（二维码内容）
  uploadScanAsset,     // (sessionId, photo, label?, onProgress?)   手机端上传照片 -> 2.5D 资产
  getAssetsBySession,  // (sessionId) => Asset[]       拉取会话下全部已就绪资产
  onAssetReady,        // (sessionId, cb) => unsubscribe   Realtime 订阅新资产
} from './modules/scan/api/scanAssetService.js'
```

`onProgress`（可选，新增）回调阶段：`loading`（模型加载 0-100）/ `processing`（AI 推理）/ `level0`（已降级）/ `uploading`。

数据契约：`scan_assets` 表（见 `docs/supabase-setup.sql`），关键字段
`{ id, session_id, status: 'pending'|'ready'|'failed', asset_url, label, created_at }`。

## 目录结构

```
scan/
├── api/scanAssetService.js      # 对外唯一 API（模块隔离边界）
├── service/supabaseClient.js    # Supabase 连接（内部）
├── service/matting.js           # U²-Netp AI 抠图（内部，Level 1）
├── service/cartoonFilter.js     # 柔和插画滤镜（内部，参数在文件顶部常量）
├── service/assetProcessor.js    # 处理主管线：抠图 → 滤镜 → 投影合成；失败降级 Level 0（内部）
├── pages/ScanPage.jsx           # 手机端拍摄页（路由 /scan?session=xxx）
└── components/QrModal.jsx       # 电脑端二维码弹窗（内部）
```

## 模块隔离承诺

- 修改 `feature-room-background` / `feature-item-placement` 的已有代码：**禁止**。
- 集成方式：仅通过上述 service API（函数调用 + 回调订阅），无内部 import、无共享 state。
- 验收：删除本目录后，宿主项目其他功能应不受影响（本演示项目中 App.jsx 的画板部分即为「摆放模块」的最小宿主示例）。

## 依赖外部资源

- `public/models/BritishWerewolf/U-2-Netp/`（onnx 4.4MB + config，**Apache-2.0，可商用**）必须随构建产出，缺失时自动降级 Level 0
- npm 依赖 `@huggingface/transformers`（Transformers.js，WASM 推理）；ONNX 运行时的 wasm 文件默认从 jsdelivr CDN 首次加载后缓存

## 替换点（后续升级）

- 换抠图算法：只改 `service/matting.js`
- 调风格参数：`service/cartoonFilter.js` 顶部常量（量化级数 / 描边阈值与颜色 / 亮度色温饱和度）
- 换真抠图 API（remove.bg 等）：只替换 `assetProcessor.processToAsset()` 内部实现，对外 API 与数据契约不变
