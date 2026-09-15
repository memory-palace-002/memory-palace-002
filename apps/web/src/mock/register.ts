/**
 * 把 Mock 传输层注册到 http 客户端（仅在 VITE_USE_MOCK=true 时被调用）
 */
import { ApiError, registerMockTransport, USE_MOCK } from '../api/http';
import { handleMock } from './server';

registerMockTransport(async (method, path, body) => {
  try {
    return await handleMock(method, path, body);
  } catch (err) {
    const e = err as { code?: number; message?: string };
    if (e && typeof e.code === 'number') {
      throw new ApiError(e.code, e.message ?? '');
    }
    throw new ApiError(50001, String(err));
  }
});

export const mockEnabled = USE_MOCK;
