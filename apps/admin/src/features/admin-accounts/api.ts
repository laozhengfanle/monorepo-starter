import axios from 'axios';
import type { AccountMenusResult, SaveAccountMenusInput } from '@starter/api-client';
import { authStorage } from '../../app/auth/auth-storage.js';

/** 账户特例授权 API（走 /api 前缀，Vite 代理转发） */

function authHeaders(): Record<string, string> {
  const token = authStorage.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 读取账户特例授权（覆盖 + 角色基线菜单 id） */
export async function getAccountMenusApi(accountId: string): Promise<AccountMenusResult> {
  const { data } = await axios.get<AccountMenusResult>(`/api/admin/accounts/${accountId}/menus`, {
    headers: authHeaders(),
  });
  return data;
}

/** 保存账户特例授权（全量覆盖） */
export async function saveAccountMenusApi(
  accountId: string,
  input: SaveAccountMenusInput,
): Promise<AccountMenusResult> {
  const { data } = await axios.put<AccountMenusResult>(
    `/api/admin/accounts/${accountId}/menus`,
    input,
    { headers: authHeaders() },
  );
  return data;
}
