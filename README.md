# 记忆书柜 · Memory Bookshelf

一个可运行的 3D 交互原型：书架上的每一本书是一个「记忆盒子」（按 周 / 月 / 年 收纳）。
悬停时书从书脊翻面露出封面；点击后书飞到镜头前摊开，内页展示照片和 2.5D 立体物件。

技术栈：Vite + React 18 + TypeScript + three.js（@react-three/fiber + drei）+ zustand。

## 运行

```sh
npm install
npm run dev        # 浏览器打开 http://localhost:5173，改代码即时热更新
npm run build      # 类型检查 + 打包到 dist/（相对路径，可部署到任意子目录）
npm run preview    # 本地预览打包产物
```

## 交互

- **悬停**：书绕装订棱翻面（书脊 → 封面），轻微上浮放大
- **点击**：相机推近，书飞到展示位，封面摊开，内页内容逐个弹入
- **打开后**：移动鼠标整书轻微倾斜，2.5D 物件反向补偿产生视差立体感；内容超过 4 个时出现翻页器
- **关闭**：Esc / 点击空白 / 右上角 ×，书合上飞回书架原位
- 拖拽环绕、滚轮缩放；打开期间自动禁用以免误操作

## 换成真实素材

1. **照片**：把图片放进 `public/photos/`，在 `src/data/boxes.ts` 里改 `src` 指向
2. **2.5D 物件**：扫描抠图得到的**透明背景 PNG** 放进 `public/objects/`，`kind: 'object'` 即可
3. **盒子数据**：编辑 `src/data/boxes.ts`（`MemoryBox` 结构见同文件类型定义），书本厚度会随条目数自适应
4. `coverImage` 字段已预留：填图片地址可替换 Canvas 生成的封面（当前版本封面为程序生成）

## 接入现有前端

- **iframe（任何技术栈）**：`npm run build` 后把 `dist/` 部署到任意静态目录，`<iframe src="...">` 嵌入
- **React 项目**：拷贝 `src/components`、`src/store`、`src/lib`、`src/data` 和 `src/styles.css`，
  安装 `three @react-three/fiber @react-three/drei zustand` 即可作为组件使用
- 部署在子路径时 `vite.config.ts` 的 `base: './'` 已保证资源相对引用

## 调参数

动画手感都在 `src/lib/anim.ts`：翻面角 `HOVER_ANGLE`、摊开角 `OPEN_ANGLE`、
摊开延迟 `OPEN_LIFT_DELAY`、补间速度等；机位在 `src/store/bookshelf.ts` 的
`INITIAL_POSE / STAGE / STAGE_BOOK`。
