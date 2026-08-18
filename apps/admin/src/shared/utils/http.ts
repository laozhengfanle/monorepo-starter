/**
 * 认证请求配置（REST 场景统一使用：走 /api 前缀由 Vite 代理转发）。
 *
 * P1-7 改造：access token 在 httpOnly cookie（SameSite=Strict），由浏览器自动携带
 * （axios.defaults.withCredentials = true，见 auth-api.ts），前端不再附加
 * Authorization header——本函数恒返回空对象，仅保留调用点结构以便后续演进。
 */
export function authHeaders(): Record<string, string> {
  return {};
}
