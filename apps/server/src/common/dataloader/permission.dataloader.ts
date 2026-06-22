/**
 * PermissionDataLoader — 按 accountId 批量查权限码
 *
 * 背景：管理后台查账户列表 + 各自权限时，传统实现是「查角色 → 查 role_menus → 聚合 permissionCode」
 *      在 N 个账户循环里查就是 N 次 SQL
 * 优化：DataLoader 把同帧的 accountId 合并成 1 次 SQL（adminAccountRole + adminRoleMenu + adminMenu）
 *
 * 用法：
 * ```ts
 * const permissions = await context.dataloaders.permissionsByAccountId.load(accountId);
 * // permissions: string[]（去重 + 排序后的权限码列表）
 * ```
 *
 * 数据源：
 * - admin 端：adminAccountRole → adminRole → adminRoleMenu → adminMenu.permissionCode
 * - 账户级覆盖：adminAccountMenu（grant/deny）→ adminMenu.permissionCode
 *   - 合并规则与 AdminPermissionGuard / buildAccountAuth 一致（详见 aggregatePermissions 纯函数）
 *   - 委托 aggregatePermissions 统一三处合并逻辑，避免再次走偏
 * - 一次 SQL 拼批 + 一次 IN 查询解决（角色和账户级覆盖并行执行）
 *
 * 历史 bug：早期实现漏查 adminAccountMenu，导致 /me 接口返回的 permissions 不含 grant 进去的
 *          权限码，前端按钮按 permissions 判断显隐，看不到管理员在后台给账户加的特例授权。
 */
import DataLoader from 'dataloader';
import type { PrismaService } from '../prisma/prisma.service.js';
import { aggregatePermissions } from '../utils/aggregate-permissions.js';

/** 账户的权限码集合（去重 + 排序） */
export type AccountPermissions = string[];

export function createPermissionDataLoader(prisma: PrismaService): DataLoader<string, AccountPermissions> {
    return new DataLoader<string, AccountPermissions>(async (accountIds) => {
        const ids = [...accountIds];
        if (ids.length === 0) return [];

        /**
         * 并行：角色菜单权限 + 账户级覆盖
         * - 两条 SQL 一次拼批完成（IN 查询），无依赖关系
         * - 拆分理由：adminAccountMenu 与 adminAccountRole 的过滤条件不同，强行 UNION 反而复杂
         */
        const [roleLinks, overrideLinks] = await Promise.all([
            prisma.client.adminAccountRole.findMany({
                where: { accountId: { in: ids } },
                select: {
                    accountId: true,
                    role: {
                        select: {
                            enabled: true,
                            roleMenus: {
                                select: {
                                    menu: {
                                        select: {
                                            enabled: true,
                                            permissionCode: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.client.adminAccountMenu.findMany({
                where: { accountId: { in: ids } },
                select: {
                    accountId: true,
                    type: true,
                    menu: {
                        select: {
                            enabled: true,
                            permissionCode: true,
                        },
                    },
                },
            }),
        ]);

        // 按 accountId 分组：角色权限聚合输入
        const roleMap = new Map<string, Array<{ roleMenus: Array<{ menu: { permissionCode: string } }> }>>();
        for (const link of roleLinks) {
            if (!link.role.enabled) continue;
            const list = roleMap.get(link.accountId) ?? [];
            list.push({
                roleMenus: link.role.roleMenus
                    .filter((rm) => rm.menu.enabled && rm.menu.permissionCode)
                    .map((rm) => ({ menu: { permissionCode: rm.menu.permissionCode } })),
            });
            roleMap.set(link.accountId, list);
        }

        // 按 accountId 分组：账户级覆盖（grant/deny）
        const overrideMap = new Map<string, Array<{ menu: { permissionCode: string }; type: 'grant' | 'deny' }>>();
        for (const link of overrideLinks) {
            if (!link.menu.enabled) continue;
            const code = link.menu.permissionCode;
            if (!code) continue;
            const list = overrideMap.get(link.accountId) ?? [];
            list.push({ menu: { permissionCode: code }, type: link.type as 'grant' | 'deny' });
            overrideMap.set(link.accountId, list);
        }

        // 委托 aggregatePermissions 合并（与 Guard / CacheService 共用同一份聚合逻辑）
        return accountIds.map((id) => {
            const roles = roleMap.get(id) ?? [];
            const overrides = overrideMap.get(id) ?? [];
            return aggregatePermissions(roles, overrides).sort();
        });
    });
}

export class PermissionDataLoader {
    private readonly loader: DataLoader<string, AccountPermissions>;

    constructor(prisma: PrismaService) {
        this.loader = createPermissionDataLoader(prisma);
    }

    load(accountId: string): Promise<AccountPermissions> {
        return this.loader.load(accountId);
    }

    /**
     * 批量加载多个账户的权限码
     * - 内部走 DataLoader.loadMany（仍合并成 1 次 SQL）
     * - 返回 (string[] | Error)[]，调用方需 narrow
     */
    loadMany(accountIds: string[]): Promise<Array<AccountPermissions | Error>> {
        return this.loader.loadMany(accountIds);
    }

    clear(accountId: string): void {
        this.loader.clear(accountId);
    }
}
