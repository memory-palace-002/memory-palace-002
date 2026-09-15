/**
 * 应用入口：挂载 React 根，注入样式与路由。
 *
 * 样式加载顺序（合并策略，互不覆盖）：
 *  1. team-base.css —— 团队设计系统（--color-* 变量 + 团队组件样式），必须先加载，
 *     保证团队页面（登录/首页/成员…）的样式完整；
 *  2. tokens.css / global.css / pages.css —— 乙的设计令牌与页面样式（叠加在团队样式之上，
 *     不影响团队页面）；
 *  3. listen.css / ui.css / Toast.css —— 板块⑤ 聆听者专属样式。
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import './styles/team-base.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/pages.css';
import './features/listen/listen.css';
import './components/ui/ui.css';
import './components/ui/Toast.css';

const container = document.getElementById('root');
if (!container) throw new Error('root container #root not found');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
