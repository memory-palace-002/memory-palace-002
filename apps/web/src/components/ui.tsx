// 基础 UI 组件：Toast、响应式外壳（NavBar/TabBar）、抽屉、小件
import React, { createContext, useCallback, useContext, useState } from 'react';
import { NavLink } from 'react-router-dom';

/* ---------- Toast ---------- */
type ToastType = 'info' | 'error';
const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const show = useCallback((msg: string, type: ToastType = 'info') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}

/* ---------- 响应式外壳：移动端 TabBar / 桌面端 NavBar（§4.1） ---------- */
export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const toast = useToast();
  return (
    <div className="page desktop-shell">
      {/* 桌面顶部导航（≥768px 显示） */}
      <div className="navbar desktop-only" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="title">小角落</span>
        <span style={{ position: 'absolute', right: 20, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {title}
        </span>
      </div>
      <div className="page-body">{children}</div>
      {/* 移动端底部 Tab 栏（<768px 显示） */}
      <div className="tabbar mobile-only">
        <button className="tab" onClick={() => toast('「首页」将在板块②开放', 'info')}>
          <span className="icon">⌂</span>
          首页
        </button>
        <div className="tab tab-plus">
          <button className="plus-btn" onClick={() => toast('「记录」入口将在板块③/④开放', 'info')}>+</button>
        </div>
        <NavLink to="/me" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <span className="icon">☺</span>
          我的
        </NavLink>
      </div>
    </div>
  );
}

/* ---------- 底部抽屉 / 桌面模态 ---------- */
export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {children}
      </div>
    </div>
  );
}
