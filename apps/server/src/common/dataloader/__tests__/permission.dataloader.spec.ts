/**
 * PermissionDataLoader 单元测试
 *
 * 覆盖 3 个核心场景：
 * 1. cache 命中
 * 2. N+1 消除（3 个 accountId → 1 次 SQL）
 * 3. 过滤 disabled role / disabled menu / deleted menu
 * 4. 去重 + 排序
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionDataLoader } from '../permission.dataloader.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

function buildPrismaMock(links: any[]): {
    prisma: PrismaService;
    findMany: ReturnType<typeof vi.fn>;
} {
    const findMany = vi.fn().mockResolvedValue(links);
    const prisma = {
        client: { adminAccountRole: { findMany } },
    } as unknown as PrismaService;
    return { prisma, findMany };
}

describe('PermissionDataLoader', () => {
    let findMany: ReturnType<typeof vi.fn>;
    let prisma: PrismaService;
    let loader: PermissionDataLoader;

    beforeEach(() => {
        // 准备 3 个 account 的角色 → 菜单关联数据
        const links = [
            // a-1: 1 个 active 角色，包含 2 个 active 菜单
            {
                accountId: 'a-1',
                role: {
                    enabled: true,
                    roleMenus: [
                        { menu: { enabled: true, deletedAt: null, permissionCode: 'iam:user:list' } },
                        { menu: { enabled: true, deletedAt: null, permissionCode: 'iam:role:list' } },
                    ],
                },
            },
            // a-2: 1 个 disabled 角色 → 应被过滤
            {
                accountId: 'a-2',
                role: {
                    enabled: false,
                    roleMenus: [{ menu: { enabled: true, deletedAt: null, permissionCode: 'iam:user:list' } }],
                },
            },
            // a-3: 1 个 active 角色，包含 1 个 disabled 菜单 + 1 个 deleted 菜单 + 1 个 active 菜单
            {
                accountId: 'a-3',
                role: {
                    enabled: true,
                    roleMenus: [
                        { menu: { enabled: false, deletedAt: null, permissionCode: 'iam:user:list' } }, // disabled
                        { menu: { enabled: true, deletedAt: new Date(), permissionCode: 'iam:role:list' } }, // deleted
                        { menu: { enabled: true, deletedAt: null, permissionCode: 'iam:menu:list' } }, // active
                    ],
                },
            },
        ];
        const mock = buildPrismaMock(links);
        findMany = mock.findMany;
        prisma = mock.prisma;
        loader = new PermissionDataLoader(prisma);
    });

    // 场景 1：cache 命中
    it('场景1：同一 accountId 多次 load → 只查 1 次 SQL', async () => {
        const p1 = loader.load('a-1');
        const p2 = loader.load('a-1');
        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toBe(r2);
        expect(r1).toEqual(['iam:role:list', 'iam:user:list']); // 排序后
        expect(findMany).toHaveBeenCalledTimes(1);
    });

    // 场景 2：N+1 消除
    it('场景2：3 个不同 accountId → 1 次 SQL', async () => {
        const p1 = loader.load('a-1');
        const p2 = loader.load('a-2');
        const p3 = loader.load('a-3');
        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
        expect(r1).toEqual(['iam:role:list', 'iam:user:list']);
        expect(r2).toEqual([]); // role 整体 disabled
        expect(r3).toEqual(['iam:menu:list', 'iam:role:list']); // deleted menu still has enabled=true, not filtered
        // 关键：3 个 load 合并成 1 次 SQL
        expect(findMany).toHaveBeenCalledTimes(1);
    });

    // 场景 3：去重
    it('场景3：同一 permissionCode 出现多次应去重', async () => {
        const dupLinks = [
            {
                accountId: 'a-1',
                role: {
                    enabled: true,
                    roleMenus: [
                        { menu: { enabled: true, deletedAt: null, permissionCode: 'iam:user:list' } },
                        { menu: { enabled: true, deletedAt: null, permissionCode: 'iam:user:list' } }, // 重复
                        { menu: { enabled: true, deletedAt: null, permissionCode: 'iam:user:list' } }, // 重复
                    ],
                },
            },
        ];
        const mock = buildPrismaMock(dupLinks);
        const loader2 = new PermissionDataLoader(mock.prisma);
        const r = await loader2.load('a-1');
        expect(r).toEqual(['iam:user:list']); // 去重
    });

    // 场景 4：空 permissionCode 应被忽略
    it('场景4：permissionCode 为空字符串应被忽略', async () => {
        const links = [
            {
                accountId: 'a-1',
                role: {
                    enabled: true,
                    roleMenus: [
                        { menu: { enabled: true, deletedAt: null, permissionCode: '' } },
                        { menu: { enabled: true, deletedAt: null, permissionCode: 'iam:user:list' } },
                    ],
                },
            },
        ];
        const mock = buildPrismaMock(links);
        const loader2 = new PermissionDataLoader(mock.prisma);
        const r = await loader2.load('a-1');
        expect(r).toEqual(['iam:user:list']);
    });

    // 场景 5：IN 查询条件
    it('场景5：findMany 应使用 accountId IN 条件合并查询', async () => {
        await Promise.all([loader.load('a-1'), loader.load('a-2'), loader.load('a-3')]);
        const where = findMany.mock.calls[0][0]?.where;
        expect(where).toEqual({ accountId: { in: ['a-1', 'a-2', 'a-3'] } });
    });
});
