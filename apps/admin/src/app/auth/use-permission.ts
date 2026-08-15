import { useAuth } from './auth-context.js';

/**
 * 权限检查：当前用户是否拥有指定权限点（permissionCode）。
 * - 超级管理员（super_admin 角色）隐式拥有全部权限
 * - 无权限点要求时返回 true（不校验）
 */
export function usePermission(permission?: string): boolean {
  const { user } = useAuth();
  if (!permission) {
    return true;
  }
  if (user?.roleCodes.includes('super_admin')) {
    return true;
  }
  return user?.permissions.includes(permission) ?? false;
}
