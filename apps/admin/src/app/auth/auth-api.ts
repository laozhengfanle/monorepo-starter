import axios from 'axios';
import type { AxiosError } from 'axios';
import type { AdminMe, AuthResult, LoginInput } from '@starter/api-client';
import { authStorage } from './auth-storage.js';

/** 认证 API（走 /api 前缀，开发环境由 Vite 代理转发）
 *
 * P1-7 改造：access token 由后端 Set-Cookie（httpOnly + SameSite=Strict）下发，
 * 前端不再手动带 Authorization header（axios withCredentials 自动携带 cookie）。
 */

// P1-7：凭证在 httpOnly cookie，所有 axios 请求默认携带（同源 /api 代理下无跨域副作用）
axios.defaults.withCredentials = true;

// 401 全局拦截：token 失效/被撤销时清内存会话并跳登录页。
// 已在 /login 时不再跳转（登录失败本身也是 401，避免循环跳转）。
axios.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      authStorage.clear();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export async function loginApi(input: LoginInput): Promise<AuthResult> {
  const { data } = await axios.post<AuthResult>('/api/auth/login', input, {
    withCredentials: true,
  });
  return data;
}

/** 读取当前登录用户（凭证走 httpOnly cookie，无需传 token） */
export async function fetchMe(): Promise<AdminMe> {
  const { data } = await axios.get<AdminMe>('/api/auth/me', {
    withCredentials: true,
  });
  return data;
}

export async function logoutApi(): Promise<void> {
  await axios.post('/api/auth/logout', {}, { withCredentials: true });
}
