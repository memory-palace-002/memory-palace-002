import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { ingestCapture } from './lib/ingest';

// 队友模块接入点: window.ingestCapture({ photos, scans, texts, voices, time, place })
// 调用后自动新建一本以当天日期命名的书并收入素材
(window as any).ingestCapture = ingestCapture;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
