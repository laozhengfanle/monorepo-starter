import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * 声明接口所需的权限点（permissionCode），配合 PermissionGuard 使用。
 * 示例：@RequirePermission('user:list', 'user:create')
 * 超级管理员（super_admin 角色）自动绕过。
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
