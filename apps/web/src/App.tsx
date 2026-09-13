// 路由与守卫（板块①：/login 登录、/me 个人中心；其余板块后续追加）
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { ToastProvider } from './components/ui';
import LoginPage from './pages/Login';
import MePage from './pages/Me';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn());
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn());
  return <Navigate to={isLoggedIn ? '/me' : '/login'} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
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
