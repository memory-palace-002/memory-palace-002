import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // 允许同一 Wi-Fi 下的手机/其他电脑访问（双人协作测试用）
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
