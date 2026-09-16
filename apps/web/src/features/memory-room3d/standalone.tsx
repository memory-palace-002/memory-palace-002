/**
 * standalone 入口 —— 把 MemoryRoom3D 挂满全屏，供 vite.standalone.config.ts 打包成独立 HTML
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MemoryRoom3D from './MemoryRoom3D'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRoom3D />
  </StrictMode>
)
