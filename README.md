# 回忆宫殿 · Memory Palace

> 双网页平台（电脑 + 手机浏览器）：3D 回忆小角落 + 轻量 3D 扫描 + AI 聆听者。
> 规格文档见仓库外 `/Users/pmx/黑客松/开发规格说明书2.0.md`。

## 项目结构（§1.3 monorepo）

```
memory-palace/
├── apps/
│   ├── web/        # 前端（React 18 + Vite + R3F 预留）
│   └── server/     # 后端（Node + Express，开发环境用 Node 内置 SQLite）
└── docker-compose.yml   # PostgreSQL / Redis / MinIO（后续阶段启用）
```

## 如何运行（开发环境）

需要：Node.js 20+（本机已有 22.22）。

打开 **两个终端**：

**终端 1 — 后端（端口 8787）**
```bash
cd apps/server
npm install        # 首次运行需要
npm run dev
```

**终端 2 — 前端（端口 5173）**
```bash
cd apps/web
npm install        # 首次运行需要
npm run dev
```

然后浏览器打开 **http://localhost:5173**。

- 手机宽度（<768px）显示底部 Tab 栏；电脑宽度显示顶部导航——可直接拖拽浏览器窗口宽度体验双端形态。
- 登录使用 **mock 验证码 `123456`**（短信服务商备案完成前）；新手机号自动注册并创建默认个人宫殿。
- 数据库文件：`apps/server/data/memory-palace.db`（SQLite，可随时删除重置）。

## 当前进度

| 板块 | 状态 |
|---|---|
| ① 地基与账号（登录 / 个人中心 / 设计系统） | ✅ 本仓库当前内容 |
| ② 宫殿与成员 | 待开发（乙） |
| ③ 3D 核心视图与摆放 | 待开发（丙） |
| ④ 轻量 3D 生成管线 | 待开发（丁） |
| ⑤ AI 聆听者 | 待开发（乙） |
| ⑥ 分享与打磨 | 待开发（甲） |

## Git 工作约定

- 每个板块一个分支：`git checkout -b feature/board-1-foundation`
- 提交前确认 `git status`，只提交有意义的变更
- 出错回滚：`git log` 找到正常版本 → `git checkout <commit-id> .`
