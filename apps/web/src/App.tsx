// 路由与守卫（板块①登录/个人中心 + 板块②首页/角落页；其余板块后续追加）
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { ToastProvider } from './components/ui';
import LoginPage from './pages/Login';
import MePage from './pages/Me';
import HomePage from './pages/Home';
import PalaceMembersPage from './pages/PalaceMembers';
import PalacePlaceholderPage from './pages/PalacePlaceholder';

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
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
