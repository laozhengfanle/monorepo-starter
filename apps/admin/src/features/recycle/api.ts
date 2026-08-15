import axios from 'axios';
import type { AdminAccount, UserVo } from '@starter/api-client';

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
import { authStorage } from '../../app/auth/auth-storage.js';

/** 回收站 API（走 /api 前缀，Vite 代理转发） */

function authHeaders(): Record<string, string> {
  const token = authStorage.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 已删除账户列表 */
export async function listDeletedAccountsApi(page: number, pageSize: number): Promise<Paged<AdminAccount>> {
  const { data } = await axios.get<Paged<AdminAccount>>('/api/admin/accounts/deleted', {
    params: { page, pageSize },
    headers: authHeaders(),
  });
  return data;
}

/** 恢复已删账户 */
export async function restoreAccountApi(id: string): Promise<AdminAccount> {
  const { data } = await axios.post<AdminAccount>(`/api/admin/accounts/${id}/restore`, {}, {
    headers: authHeaders(),
  });
  return data;
}

/** 彻底删除账户 */
export async function hardRemoveAccountApi(id: string): Promise<AdminAccount> {
  const { data } = await axios.delete<AdminAccount>(`/api/admin/accounts/${id}/hard`, {
    headers: authHeaders(),
  });
  return data;
}

/** 已删除用户列表 */
export async function listDeletedUsersApi(page: number, pageSize: number): Promise<Paged<UserVo>> {
  const { data } = await axios.get<Paged<UserVo>>('/api/users/deleted', {
    params: { page, pageSize },
    headers: authHeaders(),
  });
  return data;
}

/** 恢复已删用户 */
export async function restoreUserApi(id: string): Promise<UserVo> {
  const { data } = await axios.post<UserVo>(`/api/users/${id}/restore`, {}, {
    headers: authHeaders(),
  });
  return data;
}

/** 彻底删除用户 */
export async function hardRemoveUserApi(id: string): Promise<UserVo> {
  const { data } = await axios.delete<UserVo>(`/api/users/${id}/hard`, {
    headers: authHeaders(),
  });
  return data;
}
