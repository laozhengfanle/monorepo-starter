import axios from 'axios';
import type { AdminMe, ChangePasswordInput, UpdateSelfInput } from '@starter/api-client';
import { authStorage } from '../../app/auth/auth-storage.js';

/** 个人中心 API（走 /api 前缀，开发环境由 Vite 代理转发） */

function authHeaders(): Record<string, string> {
  const token = authStorage.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 更新自己的资料（nickname/email/phone/avatar） */
export async function updateSelfApi(input: UpdateSelfInput): Promise<AdminMe> {
  const { data } = await axios.patch<AdminMe>('/api/auth/me', input, {
    headers: authHeaders(),
  });
  return data;
}

/** 修改密码（成功后账号所有 token 被撤销） */
export async function changePasswordApi(input: ChangePasswordInput): Promise<void> {
  await axios.post('/api/auth/me/password', input, { headers: authHeaders() });
}

/** 上传头像：multipart → { url } */
export async function uploadAvatarApi(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await axios.post<{ url: string }>('/api/upload', form, {
    headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
