import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 板块⑤ 与 shared 契约使用的工作区别名（在团队配置基础上增量添加，不改动团队设置）
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: true, // 允许同一 Wi-Fi 下的手机/其他电脑访问（双人协作测试用）
    // 团队真实后端代理（保留）
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
