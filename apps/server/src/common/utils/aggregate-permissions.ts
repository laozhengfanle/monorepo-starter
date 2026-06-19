/**
 * 权限聚合纯函数
 * - 从角色菜单中提取权限码
 * - 应用账户级覆盖：grant 追加，deny 移除
 * - 去重返回
 * - 不依赖 Prisma/Redis，纯数据操作，容易测试
 */
export function aggregatePermissions(
    roles: Array<{ roleMenus: Array<{ menu: { permissionCode: string } }> }>,
    overrides: Array<{ menu: { permissionCode: string }; type: 'grant' | 'deny' }>,
): string[] {
    // 1. 从角色菜单中提取权限码
    const rolePermissions = roles.flatMap((r) => r.roleMenus.map((rm) => rm.menu.permissionCode).filter(Boolean));
    // 2. 处理额外权限：授权的追加，禁止的移除
    const grantPermissions = overrides
        .filter((o) => o.type === 'grant')
        .map((o) => o.menu.permissionCode)
        .filter(Boolean);
    const denyPermissions = new Set(
        overrides
            .filter((o) => o.type === 'deny')
            .map((o) => o.menu.permissionCode)
            .filter(Boolean),
    );
    // 3. 合并去重，移除 deny
    return [...new Set([...rolePermissions, ...grantPermissions])].filter((p) => !denyPermissions.has(p));
}
