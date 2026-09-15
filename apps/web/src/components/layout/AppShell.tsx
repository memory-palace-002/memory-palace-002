/**
 * AppShell —— 双端布局骨架（§4.1）
 * 桌面：顶部 NavBar + 居中内容区（最大宽 1200）
 * 移动：单列 + 底部 TabBar（3D/扫描/聆听等沉浸式页面不显示 TabBar）
 */
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { NavBar } from './NavBar';
import { TabBar } from './TabBar';
import { useIsDesktop } from '../../hooks/useResponsive';
import { CreatePalaceProvider } from '../../features/palaces/CreatePalaceContext';
import './layout.css';

/** 沉浸式页面：不显示 TabBar（3D 主视图 / 摆放 / 扫描 / 聆听 / 登录） */
const IMMERSIVE = [/^\/login/, /^\/scan/, /^\/items\/[^/]+\/listen$/, /^\/cabinets\/[^/]+\/(view|place)$/];

export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();
  const immersive = IMMERSIVE.some((re) => re.test(pathname));
  const showTabBar = !isDesktop && !immersive;

  return (
    <CreatePalaceProvider>
      <div className="app-shell">
        {isDesktop && !immersive ? <NavBar /> : null}
        <main className={['app-main', showTabBar ? 'pb-tab' : ''].filter(Boolean).join(' ')}>
          {children}
        </main>
        {showTabBar ? <TabBar /> : null}
      </div>
    </CreatePalaceProvider>
  );
}
