import { SetMetadata } from '@nestjs/common';

/**
 * @RequireAuth() 装饰器 — 标记控制器进入权限保护模式
 * - 配合 AdminPermissionGuard 使用
 * - 仿照 @Public() 的模式，做类级别标记
 * - 未标记的控制器（member/health/auth）不受 Guard 影响
 *
 * 三层逻辑：
 * 1. 未标记 @RequireAuth() → 直接放行
 * 2. 标记了 @RequireAuth() 但方法无 @Permission() → 403（开发时立刻发现漏了）
 * 3. 标记了 @RequireAuth() 且方法有 @Permission() → 校验权限码
 */
export const REQUIRE_AUTH_KEY = 'requireAuth';
export const RequireAuth = () => SetMetadata(REQUIRE_AUTH_KEY, true);
