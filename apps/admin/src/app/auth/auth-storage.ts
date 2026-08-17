/** access token 存储 key */
const ACCESS_TOKEN_KEY = 'admin_access_token';
/**
 * 旧版 refresh token 存储 key（历史遗留）。
 * 当前无刷新流程消费 refresh token，纯增 XSS 暴露面，已不再写入；
 * clear() 时顺带清理旧值，避免跨账号残留。
 */
const LEGACY_REFRESH_TOKEN_KEY = 'admin_refresh_token';

/** token 存取：登录状态持久化（仅存 access token） */
export const authStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  setAccessToken(accessToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  },
};
