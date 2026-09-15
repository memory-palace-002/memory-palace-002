import { ErrorMessage, type ApiResponse } from '@shared/index';

/** 接口基路径（§3 统一约定） */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';

/** 是否使用本地 Mock（后端未就绪时置 true；联调时置 false） */
export const USE_MOCK: boolean = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

export class ApiError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(code: number, message: string, status = 200) {
    super(message || ErrorMessage[code] || '出了点问题，请稍后再试');
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/* ------------------------------- Token ------------------------------- */

const ACCESS_KEY = 'xjl.access_token';
const REFRESH_KEY = 'xjl.refresh_token';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/* ----------------------------- Transport ----------------------------- */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

export interface RequestOptions {
  /** 该接口是否允许匿名（Auth / SMS 类） */
  anonymous?: boolean;
  signal?: AbortSignal;
}

const unauthListeners = new Set<() => void>();

export function onUnauthorized(fn: () => void): () => void {
  unauthListeners.add(fn);
  return () => unauthListeners.delete(fn);
}

function notifyUnauthorized() {
  unauthListeners.forEach((fn) => fn());
}

/** 401 时跳登录并记录回跳地址（与分享页回跳共用逻辑，S2） */
let redirector: ((returnTo: string) => void) | null = null;
export function setUnauthorizedRedirector(fn: (returnTo: string) => void) {
  redirector = fn;
}

/** Mock 传输层在 src/mock/transport.ts 实现，这里做懒加载避免打包进真实请求路径 */
let mockTransport: ((method: HttpMethod, path: string, body?: unknown) => Promise<unknown>) | null =
  null;

export function registerMockTransport(
  fn: (method: HttpMethod, path: string, body?: unknown) => Promise<unknown>,
) {
  mockTransport = fn;
}

async function realRequest<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.access;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: Partial<ApiResponse<T>> | null = null;
  try {
    payload = (await res.json()) as Partial<ApiResponse<T>>;
  } catch {
    /* 忽略非 JSON 响应 */
  }

  if (!res.ok) {
    const code = payload?.code ?? res.status * 100 + 1;
    if (res.status === 401 || code === 40101) {
      notifyUnauthorized();
      redirector?.(location.pathname + location.search);
    }
    throw new ApiError(code, payload?.message ?? '', res.status);
  }

  const code = payload?.code ?? 0;
  if (code !== 0) {
    if (code === 40101) {
      notifyUnauthorized();
      redirector?.(location.pathname + location.search);
    }
    throw new ApiError(code, payload?.message ?? '');
  }

  return payload?.data as T;
}

export async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  try {
    if (USE_MOCK) {
      if (!mockTransport) {
        // 动态注入，避免顶层循环依赖
        await import('../mock/register');
      }
      return (await mockTransport!(method, path, body)) as T;
    }
    return await realRequest<T>(method, path, body);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 40101) {
        notifyUnauthorized();
        redirector?.(location.pathname + location.search);
      }
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(-1, '', 0);
  } finally {
    void options;
  }
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  del: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
};

/** 把 ApiError 映射成用户可读文案（GlobalErrorHandler 兜底） */
export function toUserMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return ErrorMessage[err.code] ?? err.message ?? '出了点问题，请稍后再试';
  }
  if (err instanceof Error) return err.message;
  return '出了点问题，请稍后再试';
}
