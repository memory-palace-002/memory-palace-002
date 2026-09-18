import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' 使 npm run build 产出的 dist 可部署在任意子路径 / 直接 iframe 嵌入
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
});
