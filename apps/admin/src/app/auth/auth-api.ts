import axios from 'axios';
import type { AxiosError } from 'axios';
import type { AdminMe, AuthResult, LoginInput } from '@starter/api-client';
import { authStorage } from './auth-storage.js';

/** 认证 API（走 /api 前缀，开发环境由 Vite 代理转发） */

// 401 全局拦截：token 失效/被撤销时清空存储并跳登录页。
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
  const { data } = await axios.post<AuthResult>('/api/auth/login', input);
  return data;
}

export async function fetchMe(accessToken: string): Promise<AdminMe> {
  const { data } = await axios.get<AdminMe>('/api/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export async function logoutApi(accessToken: string): Promise<void> {
  await axios.post(
    '/api/auth/logout',
    {},
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
}
