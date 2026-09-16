import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

// 独立打包 3D 回忆房间：npx vite build --config vite.standalone.config.ts
// 产物在 dist-standalone/，可拷走配合本地服务器单独运行
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-standalone",
    emptyOutDir: true,
    assetsInlineLimit: 0, // 不要把 worker 之类的资源内联进 JS，保持文件结构可预测
    rollupOptions: {
      input: resolve(__dirname, "standalone-memory3d.html"),
    },
  },
})
