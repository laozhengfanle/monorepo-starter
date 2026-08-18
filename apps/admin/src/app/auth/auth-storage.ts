/**
 * 会话状态存储（P1-7 改造后）：
 * - access token 已改由后端 Set-Cookie 下发（httpOnly + SameSite=Strict），
 *   JS 无法读取、无法落 localStorage——消除 XSS 单点窃取面。
 * - 本模块只保留一个**内存态**会话标记，供 401 拦截/登出时同步前端状态；
 *   刷新页面后内存态丢失，登录态以 /auth/me 探测结果为准（cookie 自动携带）。
 */
let hasSession = false;

export const authStorage = {
  /** 已无 JS 可读的 token（httpOnly cookie），恒返回 null——调用方勿再依赖其值 */
  getAccessToken(): string | null {
    return null;
  },
  /** 登录成功后置内存会话标记（仅为前端状态同步；真实凭证在 httpOnly cookie） */
  setAccessToken(_accessToken: string): void {
    hasSession = true;
  },
  /** 内存态会话标记（刷新页面后为 false；真实登录态以 /auth/me 为准） */
  hasSession(): boolean {
    return hasSession;
  },
  clear(): void {
    hasSession = false;
  },
};
