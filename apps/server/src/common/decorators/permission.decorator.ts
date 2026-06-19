import { SetMetadata } from '@nestjs/common';

/**
 * @Permission() 装饰器 — 标记端点所需权限码
 * - 配合 AdminPermissionGuard / MemberPermissionGuard 使用
 * - 多个权限码用 OR 语义（任一即可通过）：
 *
 *   @Permission('dashboard:welcome')              // 单权限（向后兼容）
 *   @Permission('dashboard:welcome', 'dashboard:analytics')  // 任一即可
 *
 * - 为什么用 OR 而不是 AND：仪表盘 stats 既要 welcome 用户能查，也要 analytics 用户能查，
 *   不同子页面用户可能持有不同权限码。AND 语义会让 welcome 用户无法访问 stats，
 *   不得不在服务端写"用户任一角色拥有任一权限"的复杂逻辑；交给守卫 .some() 更简单。
 */
export const PERMISSION_KEY = 'permission';
export const Permission = (...codes: string[]) => SetMetadata(PERMISSION_KEY, codes);
