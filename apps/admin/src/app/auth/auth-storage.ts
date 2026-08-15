/** access token 存储 key */
const ACCESS_TOKEN_KEY = 'admin_access_token';
/** refresh token 存储 key（阶段 3 简化：localStorage；后续可改 httpOnly cookie） */
const REFRESH_TOKEN_KEY = 'admin_refresh_token';

/** token 存取：登录状态持久化 */
export const authStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
