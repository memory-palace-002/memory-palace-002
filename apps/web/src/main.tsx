/**
 * 应用入口：挂载 React 根，注入全局样式与路由。
 * 默认走 Mock（VITE_USE_MOCK !== 'false'），无需后端即可跑通乙负责的页面。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';

import './styles/tokens.css';
import './styles/global.css';
import './styles/pages.css';

const container = document.getElementById('root');
if (!container) throw new Error('root container #root not found');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
