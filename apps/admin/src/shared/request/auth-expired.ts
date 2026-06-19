/**
 * 认证过期统一处理
 *
 * 当检测到用户认证过期（HTTP 401 或 GraphQL 20003 错误）时，
 * 统一执行：清除登录状态 → 硬跳转到登录页。
 *
 * 为什么用 window.location.replace 而不是 Vue Router push？
 *   - replace 会立即替换当前页面，终止所有 JS 执行（包括未完成的 catch 链）
 *   - 这样页面中的 message.error() 不会执行，避免先弹窗再跳转
 *   - push 是软导航，catch 链继续执行会先弹出错误提示
 *
 * 为什么不直接在 graphql-client / request 里写跳转逻辑？
 *   - 两个模块都需要相同的跳转行为，提取后避免重复
 *   - 后续如果跳转逻辑变化（比如加倒计时提示），只改一处
 */

import { removeAuthStatus } from './request';

/** 防止并发 401 触发多次跳转 */
let isRedirecting = false;

/**
 * 处理认证过期：清除登录状态并硬跳转到登录页
 *
 * 调用时机：
 *   - HTTP 401 且 Token 刷新失败
 *   - GraphQL 响应中包含 extensions.code === '20003'（未认证）
 *
 * 此函数调用后，当前页面的 JS 执行会被浏览器中断，
 * 后续的 catch / message.error 不会执行。
 */
export function handleAuthExpired(): void {
    // 防止并发请求同时触发多次跳转
    if (isRedirecting) return;
    isRedirecting = true;

    // 清除前端登录状态标志
    removeAuthStatus();

    // 硬跳转到登录页（replace 不会留下历史记录，用户不能后退回过期页面）
    window.location.replace(`${window.location.pathname}#/login`);
}
