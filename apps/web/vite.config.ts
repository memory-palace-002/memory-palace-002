import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

/*
 * 发布为在线应用时，平台只暴露一个端口，端口号通过 PORT 环境变量下发。
 * Vite 默认不读 PORT，所以这里显式接一下；本地开发没设 PORT，回落到 Vite 默认端口。
 */
const port = process.env.PORT ? Number(process.env.PORT) : undefined

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  /* 发布为在线应用时必须：监听 0.0.0.0 并放行反向代理域名 */
  server: {
    host: true,
    allowedHosts: true,
    ...(port ? { port, strictPort: true } : {}),
  },
  preview: {
    host: true,
    allowedHosts: true,
    ...(port ? { port, strictPort: true } : {}),
  },
})
