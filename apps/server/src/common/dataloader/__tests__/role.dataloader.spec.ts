/**
 * RoleDataLoader 单元测试
 *
 * 覆盖 3 个核心场景：
 * 1. cache 命中
 * 2. N+1 消除（3 个 accountId 合并成 2 次 SQL：admin + member，Promise.all 并行）
 * 3. 角色 enabled=false 过滤
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleDataLoader } from '../role.dataloader.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

function buildPrismaMock(opts: { adminLinks?: any[]; memberLinks?: any[] }): {
    prisma: PrismaService;
    adminFindMany: ReturnType<typeof vi.fn>;
    memberFindMany: ReturnType<typeof vi.fn>;
} {
    const adminFindMany = vi.fn().mockResolvedValue(opts.adminLinks ?? []);
    const memberFindMany = vi.fn().mockResolvedValue(opts.memberLinks ?? []);
    const prisma = {
        client: {
            adminAccountRole: { findMany: adminFindMany },
            memberAccountRole: { findMany: memberFindMany },
        },
    } as unknown as PrismaService;
    return { prisma, adminFindMany, memberFindMany };
}

describe('RoleDataLoader', () => {
    let adminFindMany: ReturnType<typeof vi.fn>;
    let memberFindMany: ReturnType<typeof vi.fn>;
    let prisma: PrismaService;
    let loader: RoleDataLoader;

    beforeEach(() => {
        const mock = buildPrismaMock({
            adminLinks: [
                { accountId: 'a-1', role: { code: 'admin', enabled: true } },
                { accountId: 'a-1', role: { code: 'super', enabled: true } },
                { accountId: 'a-2', role: { code: 'admin', enabled: true } },
                { accountId: 'a-3', role: { code: 'admin', enabled: false } }, // 禁用角色应被过滤
            ],
            memberLinks: [{ accountId: 'a-2', role: { code: 'vip', enabled: true } }],
        });
        adminFindMany = mock.adminFindMany;
        memberFindMany = mock.memberFindMany;
        prisma = mock.prisma;
        loader = new RoleDataLoader(prisma);
    });

    // 场景 1：cache 命中
    it('场景1：同一 accountId 多次 load → 只查 2 次 SQL（admin + member 并行）', async () => {
        const p1 = loader.load('a-1');
        const p2 = loader.load('a-1');
        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toBe(r2);
        expect(r1.adminRoles).toEqual(['admin', 'super']);
        expect(r1.memberRoles).toEqual([]);
        // admin + member 各查 1 次（共 2 次），cache 命中后续 load
        expect(adminFindMany).toHaveBeenCalledTimes(1);
        expect(memberFindMany).toHaveBeenCalledTimes(1);
    });

    // 场景 2：N+1 消除
    it('场景2：3 个不同 accountId → 1 次 admin SQL + 1 次 member SQL（不增加）', async () => {
        const p1 = loader.load('a-1');
        const p2 = loader.load('a-2');
        const p3 = loader.load('a-3');
        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
        expect(r1.adminRoles).toEqual(['admin', 'super']);
        expect(r2.adminRoles).toEqual(['admin']);
        expect(r2.memberRoles).toEqual(['vip']);
        expect(r3.adminRoles).toEqual([]); // 唯一角色被 disabled 过滤
        // 关键：3 个 account 合并成 1 次 admin SQL + 1 次 member SQL
        expect(adminFindMany).toHaveBeenCalledTimes(1);
        expect(memberFindMany).toHaveBeenCalledTimes(1);
    });

    // 场景 3：未配置角色的账户
    it('场景3：无角色的账户应返回空数组（而不是 undefined）', async () => {
        const result = await loader.load('non-existent-account');
        expect(result.adminRoles).toEqual([]);
        expect(result.memberRoles).toEqual([]);
    });

    // 场景 4：IN 查询条件
    it('场景4：findMany 应使用 accountId IN 条件合并查询', async () => {
        await Promise.all([loader.load('a-1'), loader.load('a-2'), loader.load('a-3')]);
        const adminWhere = adminFindMany.mock.calls[0][0]?.where;
        expect(adminWhere).toEqual({ accountId: { in: ['a-1', 'a-2', 'a-3'] } });
    });
});
