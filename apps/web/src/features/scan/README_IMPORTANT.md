# README_IMPORTANT.md · 跨设备扫描模块集成说明

> 给接手的队友：这份文档说明**依赖、必配的 Key、入口文件与集成步骤**。按第 5 节顺序操作即可合入主项目，约 15 分钟。
> 模块版本：分支 `feature-integrate-scan`，最新提交 `0f07a7d`

---

## 0. 这个模块做什么

「手机扫描真实物品 → 云端处理成 2.5D 贴图 → 电脑大屏实时出现并摆放」的跨设备协同模块。

```
电脑端（宿主摆放页）           手机端                    云端                     电脑端
点「添加扫描物品」  ──二维码──▶  /scan 拍照  ──上传──▶  Supabase Storage      Realtime 推送
生成 session + 二维码            AI 抠图+滤镜            scan_assets 表    ──▶  自动拉取贴图到画板
```

---

## 1. 第三方依赖（相对宿主项目新增的）

**运行依赖**（`package.json` → `dependencies`）：

| 包 | 版本 | 用途 | 说明 |
|---|---|---|---|
| `@huggingface/transformers` | `^3.0.0` | 浏览器端 AI 抠图推理（WASM） | **本模块新增**，约 450KB；ONNX 运行时的 wasm 文件首次从 jsdelivr CDN 加载，之后浏览器缓存 |
| `@supabase/supabase-js` | `^2.45.4` | 云数据库 / 对象存储 / Realtime | **本模块新增** |
| `qrcode` | `^1.5.4` | 电脑端生成二维码 | **本模块新增**，纯前端出图 |
| `react` / `react-dom` | `^18.3.1` | 框架 | 宿主项目一般已有，无需重复安装 |

**开发依赖**（`devDependencies`，宿主已有则忽略）：`vite ^5.4.8`、`@vitejs/plugin-react ^4.3.1`

```bash
npm install @huggingface/transformers @supabase/supabase-js qrcode
```

> ⚠️ 不带任何 AI 重绘模型（无 Stable Diffusion 之类），只有 4.4MB 的 U²-Netp 分割模型，随站点静态分发，不影响构建体积上限。

---

## 2. 必须配置的 Key / 环境变量

在项目根目录创建 `.env.local`（Vite 自动读取，已被 `.gitignore` 排除）：

```bash
VITE_SUPABASE_URL=https://ztmixxymdmqnjwanxdbf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0bWl4eHltZG1xbmp3YW54ZGJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NDM3NDMsImV4cCI6MjEwNTIxOTc0M30.zArfQhD_zV3Xodd5z8-6iEPqy4LvcOsccmNF9GabwrI
```

- `VITE_SUPABASE_URL`：Supabase 项目地址（Dashboard → Project Settings → API）
- `VITE_SUPABASE_ANON_KEY`：Supabase **anon public** 密钥。这是**公开客户端密钥**（前端必须内联，可安全暴露），上面的值就是当前 demo 项目在用的，可直接复用；也可以换成你自己的项目。
- 注意：`.env.local` **没有放进压缩包**（避免密钥入库），也可以直接参考包内的 `.env.example`。

**部署到 Vercel 时**：Project Settings → Environment Variables 添加同样两条（Production + Preview）。

> ⚠️ 踩过的坑：只在部署请求里传 env（deployment 级）对 Vite 框架构建**不生效**，必须写进**项目级**环境变量；改完必须 **Redeploy** 才会进产物。验证办法：构建后 grep 产物 JS 里能否搜到你的项目 ref 字符串。

---

## 3. 云端资源初始化（只需做一次）

执行 `docs/supabase-setup.sql`（Supabase Dashboard → SQL Editor 直接粘贴运行），它会：

1. 建表 `scan_assets`（字段：`id / session_id / status / asset_url / label / created_at`）
2. 建 RLS 策略（**演示用宽松策略**，正式上线请按需收紧）
3. 把 `scan_assets` 加入 Realtime publication（电脑端实时接收的前提）
4. 建公共读的 Storage 桶 `scan-assets`

表名/桶名是代码里的常量，定义在 `src/modules/scan/service/supabaseClient.js`（`ASSETS_TABLE` / `STORAGE_BUCKET`），改名需同步改 SQL。

---

## 4. 入口文件与触发方式

| 端 | 文件 | 作用 | 如何触发 |
|---|---|---|---|
| **电脑端宿主页（示例）** | `src/App.jsx` | 演示宿主如何接入（最小宿主 = 摆放画板） | 点「＋ 添加扫描物品」按钮 → `handleAddScanItem()` → `createScanSession()` 生成会话 + 弹出二维码 |
| **电脑端二维码弹窗** | `src/modules/scan/components/QrModal.jsx` | 展示二维码（内容 = 手机拍摄页地址） | 由 `App.jsx` 在 `showQr && session` 时渲染，二维码内容为 `buildScanUrl(session)` |
| **手机端拍摄页** | `src/modules/scan/pages/ScanPage.jsx` | 调摄像头拍照 → 处理 → 上传 | 路由 `/scan?session=xxx`；`src/main.jsx` 用 `pathname.startsWith('/scan')` 分发（零依赖简易路由） |
| **模块对外 API（集成唯一入口）** | `src/modules/scan/api/scanAssetService.js` | 5 个导出函数，见下方 | 宿主只 import 这个文件 |

```js
import {
  createScanSession,   // () => string                  生成扫码会话 ID
  buildScanUrl,        // (sessionId) => string         手机端拍摄页地址（二维码内容）
  uploadScanAsset,     // (sessionId, photo, label?, onProgress?)  手机端上传照片 → 2.5D 资产
  getAssetsBySession,  // (sessionId) => Asset[]        拉取会话下全部已就绪资产（刷新恢复）
  onAssetReady,        // (sessionId, cb) => unsubscribe   Realtime 订阅新资产（电脑端自动上屏）
} from './modules/scan/api/scanAssetService.js'
```

接入画板的最小用法（见 `src/App.jsx` 完整示例）：`onAssetReady(session, asset => setAssets(prev => [...prev, asset]))`。

---

## 5. 集成到主项目的步骤

1. **拷贝模块**：把 `src/modules/scan/` 整个目录拷进主项目同路径（模块自包含，无其他外部 import）
2. **装依赖**：`npm install @huggingface/transformers @supabase/supabase-js qrcode`
3. **拷模型**：把 `public/models/` 整个目录拷进主项目 `public/`（**4.4MB，AI 抠图必需**；缺失不会崩，会自动降级基础模式）
4. **配环境变量**：按第 2 节创建 `.env.local`
5. **初始化云端**：执行 `docs/supabase-setup.sql`
6. **宿主页接线**：在物品摆放页加「添加扫描物品」按钮 + 画板接收逻辑（照抄 `src/App.jsx`，只用 api 层）
7. **路由**：`/scan` 路径需要回退到 `index.html`
   - Vite dev 自带，无需配置
   - 生产环境（Vercel/Netlify）需加 rewrites，例如 `vercel.json`：
     ```json
     { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
     ```
8. **部署**：⚠️ 手机摄像头 API 强制要求 **HTTPS**，局域网 IP 访问会被浏览器拦截，必须部署到公网域名
9. 验收：手机上扫码拍照 → 电脑端几秒内自动出现贴图（无需刷新）

---

## 6. 模块隔离约定（原项目死命令）

- 宿主**只允许** import `api/scanAssetService.js`；不要引用模块内部的 `service/`、`pages/`、`components/`
- 合法集成方式只有三种：service 函数调用 / `onAssetReady` 回调 / props 传参
- 现有 `feature-room-background`、`feature-item-placement` 代码**零改动**（本模块从未碰过它们）
- 自检：删掉 `src/modules/scan/` 后，宿主其余功能应完全不受影响

---

## 7. 已知行为与兜底（重要）

| 场景 | 行为 |
|---|---|
| AI 模型加载失败 / 推理失败 / 滤镜超时（>3s） | 自动降级 **Level 0**（居中裁剪 + 简单处理），页面上会提示「已降级基础模式」，**不报错、不白屏** |
| 首次抠图 | 需下载 4.4MB 模型（+ WASM 运行时），约 10-30 秒，按钮上显示「AI 模型加载中 x%」；之后浏览器缓存，秒抠 |
| 弱网上传失败 | 自动重试一次；资产输出 **WebP 640px（60-150KB）**，替代 1-2MB PNG，规避国内直连 Supabase 大文件被重置的问题 |
| 手机拍摄分辨率 | 上限 1280px（降处理耗时） |
| 展示层投影/网格/缩放 | 由宿主 CSS 提供（`styles.css` 中 `.board-asset` 等），不属于模块内部逻辑，可自由替换 |

调风格参数集中在 `src/modules/scan/service/cartoonFilter.js` 顶部常量（量化级数 / 描边阈值与颜色 / 亮度色温饱和度）。

---

## 8. 压缩包文件清单

```
scan-module-demo/
├── README_IMPORTANT.md          # 本文档
├── README.md                    # 项目运行说明
├── package.json / vite.config.js / index.html / .gitignore / .env.example
├── docs/supabase-setup.sql      # 一键建表 + RLS + Realtime + Storage 桶
├── public/models/BritishWerewolf/U-2-Netp/   # AI 模型（onnx 4.4MB + config + LICENSE，Apache-2.0）
└── src/
    ├── main.jsx                 # 简易路由（/scan 分发）
    ├── App.jsx                  # 电脑端宿主页示例（按钮 + 二维码 + 画板拖拽/缩放）
    ├── styles.css
    └── modules/scan/            # ★ 要合并的模块
        ├── README.md            # 模块级文档（对外 API / 隔离约定 / 替换点）
        ├── api/scanAssetService.js        # 对外唯一 API
        ├── service/supabaseClient.js      # Supabase 连接与常量
        ├── service/matting.js             # U²-Netp AI 抠图
        ├── service/cartoonFilter.js       # 柔和插画滤镜
        ├── service/assetProcessor.js      # 处理主管线 + 降级兜底
        ├── pages/ScanPage.jsx             # 手机端拍摄页
        └── components/QrModal.jsx         # 二维码弹窗
```

> 已排除：`node_modules/`、`.git/`、`dist/`、`.env.local`（含密钥，不入包）

---

## 9. 版本信息

- 源码仓库：`pmx002/scan-module-demo`（私有），分支 `feature-integrate-scan`
- 最新提交：`0f07a7d` feat: 画板资产支持缩放
- 技术栈：React 18 + Vite 5 + Supabase（无自建后端）
