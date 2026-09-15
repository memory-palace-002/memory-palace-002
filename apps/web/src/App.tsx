/**
 * App —— 应用根组件：装配全局 Provider 与路由表。
 * 板块②宫殿与成员 / 板块⑤AI 聆听者（乙）相关页面在此挂载；
 * 其它板块用 StubPages 占位，避免越界实现他人代码。
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './app/ToastContext';
import { AuthProvider } from './app/AuthContext';
import { AppShell } from './components/layout/AppShell';

import { HomePage } from './pages/HomePage';
import { CabinetListPage } from './pages/CabinetListPage';
import { PalaceMembersPage } from './pages/PalaceMembersPage';
import { ListenPage } from './pages/ListenPage';
import {
  LoginPage,
  CabinetViewPage,
  PlacePage,
  ScanPage,
  MePage,
  SharedPage,
  NotFoundPage,
} from './pages/StubPages';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/palaces" replace />} />
            <Route path="/palaces" element={<HomePage />} />
            <Route path="/palaces/:id/cabinets" element={<CabinetListPage />} />
            <Route path="/palaces/:id/members" element={<PalaceMembersPage />} />
            <Route path="/cabinets/:id/view" element={<CabinetViewPage />} />
            <Route path="/cabinets/:id/place" element={<PlacePage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/items/:id/listen" element={<ListenPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/shared" element={<SharedPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </ToastProvider>
  );
}
