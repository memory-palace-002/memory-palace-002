// 登录态全局状态（zustand）
import { create } from 'zustand';
import { api, setTokens, clearTokens, getAccessToken, getRefreshToken } from '../api/client';

export interface UserInfo {
  id: string;
  phone: string | null;
  phone_masked: string;
  nickname: string;
  avatar_url: string | null;
}

interface AuthState {
  user: UserInfo | null;
  personalPalace: { id: string; name: string } | null;
  loading: boolean;
  loginWithSms: (phone: string, code: string) => Promise<{ isNewUser: boolean }>;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: () => boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  personalPalace: null,
  loading: false,

  async loginWithSms(phone, code) {
    const data = await api.post('/auth/sms/login', { phone, code });
    setTokens(data.access_token, data.refresh_token);
    set({ user: data.user });
    return { isNewUser: data.is_new_user };
  },

  async fetchMe() {
    if (!getAccessToken()) return;
    set({ loading: true });
    try {
      const data = await api.get('/auth/me');
      set({ user: data.user, personalPalace: data.personal_palace });
    } catch {
      // 401 已由 client 处理（自动刷新或跳登录）
    } finally {
      set({ loading: false });
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout', { refresh_token: getRefreshToken() });
    } catch {
      // 忽略：本地清理为准
    }
    clearTokens();
    set({ user: null, personalPalace: null });
  },

  isLoggedIn() {
    return !!getAccessToken();
  },
}));
