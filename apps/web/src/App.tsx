/**
 * 应用根组件：团队路由（板块①登录/个人中心 + 板块②首页/角落页）基础上，
 * 追加 板块⑤ AI 聆听者（乙）路由 /items/:id/listen。
 *
 * 合并策略（非替换）：以团队 main 的 App 为基底，保留团队的 ToastProvider /
 * AuthGuard / 各板块页面路由，只在末尾新增「聆听者」一条路由。聆听页内部依赖
 * 乙自己的 Toast 上下文（app/ToastContext），因此单独用 ListenToastProvider 包裹，
 * 不影响团队其余页面的 Toast 行为。
 */
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { ToastProvider } from './components/ui';
import { ToastProvider as ListenToastProvider } from './app/ToastContext';

import LoginPage from './pages/Login';
import MePage from './pages/Me';
import HomePage from './pages/Home';
import PalaceMembersPage from './pages/PalaceMembers';
import PalacePlaceholderPage from './pages/PalacePlaceholder';
import { ListenPage } from './pages/ListenPage';

// 其它板块占位（归对应同学实现，乙不越界）
import {
  CabinetViewPage,
  PlacePage,
  ScanPage,
  SharedPage,
  NotFoundPage,
} from './pages/StubPages';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn());
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn());
  return <Navigate to={isLoggedIn ? '/palaces' : '/login'} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/palaces"
            element={
              <AuthGuard>
                <HomePage />
              </AuthGuard>
            }
          />
          <Route
            path="/palaces/:id/cabinets"
            element={
              <AuthGuard>
                <PalacePlaceholderPage />
              </AuthGuard>
            }
          />
          <Route
            path="/palaces/:id/members"
            element={
              <AuthGuard>
                <PalaceMembersPage />
              </AuthGuard>
            }
          />
          <Route
            path="/me"
            element={
              <AuthGuard>
                <MePage />
              </AuthGuard>
            }
          />

          {/* 板块⑤ AI 聆听者（乙）：复用团队 AuthGuard，独立包裹乙的 Toast 上下文 */}
          <Route
            path="/items/:id/listen"
            element={
              <AuthGuard>
                <ListenToastProvider>
                  <ListenPage />
                </ListenToastProvider>
              </AuthGuard>
            }
          />

          {/* 其它板块占位页（归对应同学，乙仅保留路由壳） */}
          <Route path="/cabinets/:id/view" element={<CabinetViewPage />} />
          <Route path="/cabinets/:id/place" element={<PlacePage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/shared" element={<SharedPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
