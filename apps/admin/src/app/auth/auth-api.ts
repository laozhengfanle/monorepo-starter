import axios from 'axios';
import type { AdminMe, AuthResult, LoginInput } from '@starter/api-client';

/** 认证 API（走 /api 前缀，开发环境由 Vite 代理转发） */

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
  await axios.post('/api/auth/logout', {}, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
