/**
 * RoleDataLoader — 按 accountId 批量查角色
 *
 * 背景：管理后台 / GraphQL 查「账户 + 角色」时，传统 joinAdminRoles() 在循环里逐个查
 * 优化：DataLoader 把同帧的 accountId 合并成单条 SQL IN 查询
 *
 * 用法：
 * ```ts
 * const roles = await context.dataloaders.rolesByAccountId.load(accountId);
 * // roles: AccountRoles = { adminRoles: string[], memberRoles: string[] }
 * ```
 *
 * 数据源：
 * - admin 角色：adminAccountRole → adminRole.code
 * - member 角色：memberAccountRole → memberRole.code
 * - 一次性查出两种角色（业务上一账户只会是其中一种 userType，但查两种不会出错，
 *   且能减少 SQL 数）
 */
import DataLoader from 'dataloader';
import type { PrismaService } from '../prisma/prisma.service.js';

/** 单账户的角色码集合（admin / member 二选一或全空） */
export interface AccountRoles {
    /** admin 端的角色码（admin_account_role → admin_role.code） */
    adminRoles: string[];
    /** member 端的角色码（member_account_role → member_role.code） */
    memberRoles: string[];
}

export function createRoleDataLoader(prisma: PrismaService): DataLoader<string, AccountRoles> {
    return new DataLoader<string, AccountRoles>(async (accountIds) => {
        const ids = [...accountIds];
        if (ids.length === 0) return [];

        // 并行查两种角色（无依赖关系）
        const [adminRoleLinks, memberRoleLinks] = await Promise.all([
            prisma.client.adminAccountRole.findMany({
                where: { accountId: { in: ids } },
                select: { accountId: true, role: { select: { code: true, enabled: true } } },
            }),
            prisma.client.memberAccountRole.findMany({
                where: { accountId: { in: ids } },
                select: { accountId: true, role: { select: { code: true, enabled: true } } },
            }),
        ]);

        // 按 accountId 分组 + 过滤掉 enabled=false 的角色
        const adminMap = new Map<string, string[]>();
        for (const link of adminRoleLinks) {
            if (!link.role.enabled) continue;
            const list = adminMap.get(link.accountId) ?? [];
            list.push(link.role.code);
            adminMap.set(link.accountId, list);
        }
        const memberMap = new Map<string, string[]>();
        for (const link of memberRoleLinks) {
            if (!link.role.enabled) continue;
            const list = memberMap.get(link.accountId) ?? [];
            list.push(link.role.code);
            memberMap.set(link.accountId, list);
        }

        return accountIds.map((id) => ({
            adminRoles: adminMap.get(id) ?? [],
            memberRoles: memberMap.get(id) ?? [],
        }));
    });
}

export class RoleDataLoader {
    private readonly loader: DataLoader<string, AccountRoles>;

    constructor(prisma: PrismaService) {
        this.loader = createRoleDataLoader(prisma);
    }

    load(accountId: string): Promise<AccountRoles> {
        return this.loader.load(accountId);
    }

    clear(accountId: string): void {
        this.loader.clear(accountId);
    }
}
