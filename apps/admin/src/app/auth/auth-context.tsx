import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminMe } from '@starter/api-client';
import { authStorage } from './auth-storage.js';
import { fetchMe, loginApi, logoutApi } from './auth-api.js';

interface AuthContextValue {
  user: AdminMe | null;
  /** 初始化时校验 token（读 /auth/me）的加载态 */
  loading: boolean;
  login: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 重新拉取当前用户（菜单/权限变更后刷新侧栏） */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * 认证状态提供者：
 * - 挂载时若有 token 则调 /auth/me 恢复用户信息（token 失效则清除）
 * - login：登录 → 存 token → 拉取用户
 * - logout：撤销 + 清 token + 清用户
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = authStorage.getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe(token)
      .then(setUser)
      .catch(() => authStorage.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string, turnstileToken?: string) => {
    const result = await loginApi({ username, password, turnstileToken });
    authStorage.setTokens(result.accessToken, result.refreshToken);
    const me = await fetchMe(result.accessToken);
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    const token = authStorage.getAccessToken();
    if (token) {
      await logoutApi(token).catch(() => undefined);
    }
    authStorage.clear();
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const token = authStorage.getAccessToken();
    if (!token) {
      return;
    }
    const me = await fetchMe(token);
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return ctx;
}
