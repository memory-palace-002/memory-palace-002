/**
 * 登录态上下文
 * 板块①（甲）提供真实的手机号验证码登录页；此处只做「取身份 + 守卫 + 登出」，
 * Mock 模式下自动签发一个本地身份，保证乙负责的页面可以独立跑通。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { USE_MOCK, http, tokenStore } from '../api/http';
import type { UserVO } from '@shared/index';

interface AuthContextValue {
  user: UserVO | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserVO | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.access) {
      if (!USE_MOCK) {
        setUser(null);
        setLoading(false);
        return;
      }
      // Mock 模式：本地签发一个会话身份
      tokenStore.set('mock.access.token', 'mock.refresh.token');
    }
    try {
      const me = await http.get<UserVO>('/auth/me', { anonymous: true });
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await http.post('/auth/logout');
    } catch {
      /* 忽略登出失败 */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ user, loading, refresh, logout }),
    [user, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
