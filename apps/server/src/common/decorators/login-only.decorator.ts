import { SetMetadata } from '@nestjs/common';

/**
 * @LoginOnly() 装饰器 — 标记端点仅需登录，不需要特定权限码
 *
 * 使用场景：
 *   - Dashboard 统计数据：所有已登录管理员都能看
 *   - 个人中心相关接口：只需要知道"是谁"，不需要特定权限
 *
 * 配合 AdminPermissionGuard 使用，三层逻辑变为：
 *   1. 未标记 @RequireAuth() → 直接放行
 *   2. 标记了 @RequireAuth() + @LoginOnly() → 仅校验登录态，不校验权限码
 *   3. 标记了 @RequireAuth() + @Permission() → 校验权限码
 *   4. 标记了 @RequireAuth() 但无 @Permission() 也无 @LoginOnly() → 403（开发时发现漏了）
 */
export const LOGIN_ONLY_KEY = 'loginOnly';
export const LoginOnly = () => SetMetadata(LOGIN_ONLY_KEY, true);
