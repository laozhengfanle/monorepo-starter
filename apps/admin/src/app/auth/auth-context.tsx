import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { AdminMe } from '@starter/api-client';
import { authStorage } from './auth-storage.js';
import { fetchMe, loginApi, logoutApi } from './auth-api.js';
import { apolloClient } from '../apollo-client.js';
import { queryClient } from '../query-client.js';

interface AuthContextValue {
  user: AdminMe | null;
  /** 初始化时校验 token（读 /auth/me）的加载态 */
  loading: boolean;
  login: (
    username: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  /** 重新拉取当前用户（菜单/权限变更后刷新侧栏） */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * 认证状态提供者（P1-7 改造：token 在 httpOnly cookie，前端无 localStorage 凭证）：
 * - 挂载时总是调 /auth/me 探测登录态（cookie 自动携带；401 → 未登录）
 * - login：登录（后端 Set-Cookie）→ 拉取用户
 * - logout：撤销 + 清 cookie + 清前端状态
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // token 在 httpOnly cookie 里 JS 不可读，登录态以 /auth/me 探测为准：
    // 有 cookie → 返回用户；无/失效 → 401 → 未登录。
    fetchMe()
      .then(setUser)
      .catch(() => {
        authStorage.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (username: string, password: string, turnstileToken?: string) => {
      await loginApi({ username, password, turnstileToken });
      // 后端已 Set-Cookie（httpOnly）；内存标记仅同步前端状态
      authStorage.setAccessToken('');
      const me = await fetchMe();
      setUser(me);
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutApi().catch(() => undefined);
    authStorage.clear();
    setUser(null);
    // 清空 Apollo 缓存与 TanStack Query 缓存，防止跨账号数据残留
    await apolloClient.clearStore().catch(() => undefined);
    queryClient.clear();
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await fetchMe();
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
