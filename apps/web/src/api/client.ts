// 统一请求封装：自动带 token、401 自动刷新重试一次、统一出参解包
const BASE = '/api/v1';
const KEY_ACCESS = 'mp_access_token';
const KEY_REFRESH = 'mp_refresh_token';

export function getAccessToken() {
  return localStorage.getItem(KEY_ACCESS);
}
export function getRefreshToken() {
  return localStorage.getItem(KEY_REFRESH);
}
export function clearTokens() {
  localStorage.removeItem(KEY_ACCESS);
  localStorage.removeItem(KEY_REFRESH);
}
export function setTokens(access: string, refresh?: string) {
  localStorage.setItem(KEY_ACCESS, access);
  if (refresh) localStorage.setItem(KEY_REFRESH, refresh);
}

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

async function rawRequest(path: string, options: RequestInit = {}, retried = false): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers: { ...headers, ...(options.headers as any) } });
  const body = await res.json().catch(() => ({ code: -1, message: '响应解析失败' }));

  if (res.status === 401 && body.code === 40101 && !retried) {
    const refresh = getRefreshToken();
    if (refresh) {
      const ok = await tryRefresh(refresh);
      if (ok) return rawRequest(path, options, true);
    }
    clearTokens();
    window.location.href = '/login';
  }

  if (body.code !== 0) throw new ApiError(body.code, body.message || '请求失败');
  return body.data;
}

async function tryRefresh(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const body = await res.json();
    if (body.code !== 0) return false;
    setTokens(body.data.access_token);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: (path: string) => rawRequest(path),
  post: (path: string, data?: any) => rawRequest(path, { method: 'POST', body: JSON.stringify(data || {}) }),
};
