import { PrismaService } from '../../common/prisma/prisma.service.js';

/** 已加载角色→菜单链的账户形状（account + adminRoles.role.roleMenus.menu） */
export interface AccountWithRoleMenus {
  id: string;
  adminRoles: Array<{
    role: {
      code: string;
      roleMenus: Array<{
        menu: {
          code: string;
          enabled: boolean;
        };
      }>;
    };
  }>;
}

/**
 * 聚合账户权限点集合 —— me() 与 PermissionGuard 共用同一逻辑，保证前端显示与后端校验一致：
 * 1. 角色基线：adminRoles → roleMenus → menu.code（仅 enabled 的菜单/权限点）
 * 2. 账户级特例授权覆盖（admin_account_menu）：grant 追加、deny 移除（deny 优先于角色权限）
 *
 * 注意：super_admin 绕过在调用方处理（超管不看权限，直接放行/全量菜单）。
 */
export async function resolveAccountPermissions(
  prisma: PrismaService,
  account: AccountWithRoleMenus,
): Promise<Set<string>> {
  const permissionSet = new Set(
    account.adminRoles.flatMap((r) =>
      r.role.roleMenus.filter((rm) => rm.menu.enabled).map((rm) => rm.menu.code),
    ),
  );
  // 账户级特例授权覆盖：grant 追加、deny 移除（对标老项目 AdminAccountMenu）
  const overrides = await prisma.client.adminAccountMenu.findMany({
    where: { accountId: account.id },
    include: { menu: true },
  });
  for (const o of overrides) {
    if (o.type === 'grant') {
      permissionSet.add(o.menu.code);
    } else if (o.type === 'deny') {
      permissionSet.delete(o.menu.code);
    }
  }
  return permissionSet;
}
