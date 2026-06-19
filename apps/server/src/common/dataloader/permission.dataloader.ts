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
 * - 一次 SQL 完成（IN 查询 + JOIN）
 * - 与 AdminPermissionCacheService 的核心查询对齐（保持业务行为一致）
 */
import DataLoader from 'dataloader';
import type { PrismaService } from '../prisma/prisma.service.js';

/** 账户的权限码集合（去重 + 排序） */
export type AccountPermissions = string[];

export function createPermissionDataLoader(prisma: PrismaService): DataLoader<string, AccountPermissions> {
    return new DataLoader<string, AccountPermissions>(async (accountIds) => {
        const ids = [...accountIds];
        if (ids.length === 0) return [];

        /**
         * 单条 SQL：account → role → role_menu → menu
         * - 过滤：role.enabled=true, menu.enabled=true
         * - 仅取 menu.permissionCode（不取全行，减少网络包）
         */
        const links = await prisma.client.adminAccountRole.findMany({
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
        });

        // 按 accountId 分组 + 去重
        const grouped = new Map<string, Set<string>>();
        for (const link of links) {
            if (!link.role.enabled) continue;
            const codes = grouped.get(link.accountId) ?? new Set<string>();
            for (const rm of link.role.roleMenus) {
                if (!rm.menu.enabled) continue;
                const code = rm.menu.permissionCode;
                if (code && code.length > 0) {
                    codes.add(code);
                }
            }
            grouped.set(link.accountId, codes);
        }

        return accountIds.map((id) => {
            const codes = grouped.get(id);
            if (!codes) return [];
            // 排序：保证返回顺序稳定（GraphQL 缓存友好）
            return [...codes].sort();
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
