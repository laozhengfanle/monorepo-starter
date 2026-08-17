import { authStorage } from '../../app/auth/auth-storage.js';

/** 认证头（REST 场景统一使用：走 /api 前缀由 Vite 代理转发） */
export function authHeaders(): Record<string, string> {
  const token = authStorage.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
