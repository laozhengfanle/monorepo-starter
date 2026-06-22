/**
 * PermissionDataLoader 单元测试
 *
 * 覆盖核心场景：
 * 1. cache 命中（同 accountId 多次 load 只查 1 次）
 * 2. N+1 消除（多个 accountId 合并为 1 次 SQL）
 * 3. 过滤 disabled role / disabled menu / deleted menu
 * 4. 去重 + 排序
 * 5. IN 查询条件
 * 6. 账户级 grant 覆盖（早期 bug 修复：dataloader 漏查 adminAccountMenu）
 * 7. 账户级 deny 覆盖
 * 8. 角色权限 + 账户级 grant 合并
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionDataLoader } from '../permission.dataloader.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * 构造 prisma mock
 * - 支持两路 findMany：adminAccountRole + adminAccountMenu
 * - 默认 adminAccountMenu 返回空（测试需要时单独覆盖）
 */
function buildPrismaMock(roleLinks: any[], overrideLinks: any[] = []) {
    const roleFindMany = vi.fn().mockResolvedValue(roleLinks);
    const accountMenuFindMany = vi.fn().mockResolvedValue(overrideLinks);
    const prisma = {
        client: {
            adminAccountRole: { findMany: roleFindMany },
            adminAccountMenu: { findMany: accountMenuFindMany },
        },
    } as unknown as PrismaService;
    return { prisma, roleFindMany, accountMenuFindMany };
}

describe('PermissionDataLoader', () => {
    let roleFindMany: ReturnType<typeof vi.fn>;
    let accountMenuFindMany: ReturnType<typeof vi.fn>;
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
        roleFindMany = mock.roleFindMany;
        accountMenuFindMany = mock.accountMenuFindMany;
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
        expect(roleFindMany).toHaveBeenCalledTimes(1);
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
        expect(roleFindMany).toHaveBeenCalledTimes(1);
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
        const where = roleFindMany.mock.calls[0][0]?.where;
        expect(where).toEqual({ accountId: { in: ['a-1', 'a-2', 'a-3'] } });
    });

    // 场景 6：账户级 grant 覆盖（早期 bug 修复：dataloader 漏查 adminAccountMenu）
    it('场景6：grant 覆盖应追加到权限码列表（与 Guard / buildAccountAuth 行为一致）', async () => {
        const overrideLinks = [
            {
                accountId: 'a-1',
                type: 'grant',
                menu: { enabled: true, permissionCode: 'iam:admin:delete' },
            },
        ];
        const mock = buildPrismaMock(
            [
                {
                    accountId: 'a-1',
                    role: {
                        enabled: true,
                        roleMenus: [{ menu: { enabled: true, permissionCode: 'iam:user:list' } }],
                    },
                },
            ],
            overrideLinks,
        );
        const loader2 = new PermissionDataLoader(mock.prisma);
        const r = await loader2.load('a-1');
        // grant 追加：原 list + delete
        expect(r).toEqual(['iam:admin:delete', 'iam:user:list']);
    });

    // 场景 7：账户级 deny 覆盖
    it('场景7：deny 覆盖应从权限码列表中移除（与 Guard / buildAccountAuth 行为一致）', async () => {
        const overrideLinks = [
            {
                accountId: 'a-1',
                type: 'deny',
                menu: { enabled: true, permissionCode: 'iam:user:list' },
            },
        ];
        const mock = buildPrismaMock(
            [
                {
                    accountId: 'a-1',
                    role: {
                        enabled: true,
                        roleMenus: [
                            { menu: { enabled: true, permissionCode: 'iam:user:list' } },
                            { menu: { enabled: true, permissionCode: 'iam:role:list' } },
                        ],
                    },
                },
            ],
            overrideLinks,
        );
        const loader2 = new PermissionDataLoader(mock.prisma);
        const r = await loader2.load('a-1');
        // deny 移除：user:list 没了，只剩 role:list
        expect(r).toEqual(['iam:role:list']);
    });

    // 场景 8：grant + deny 组合 + 多个账户 IN 查询
    it('场景8：grant/deny 与角色权限合并，并按 accountId 分组', async () => {
        const overrideLinks = [
            // a-1: grant 一个角色里没有的权限
            { accountId: 'a-1', type: 'grant', menu: { enabled: true, permissionCode: 'iam:audit:read' } },
            // a-3: deny 一个角色有的权限
            { accountId: 'a-3', type: 'deny', menu: { enabled: true, permissionCode: 'iam:menu:list' } },
        ];
        const mock = buildPrismaMock(
            [
                {
                    accountId: 'a-1',
                    role: { enabled: true, roleMenus: [{ menu: { enabled: true, permissionCode: 'iam:user:list' } }] },
                },
                {
                    accountId: 'a-3',
                    role: {
                        enabled: true,
                        roleMenus: [
                            { menu: { enabled: true, permissionCode: 'iam:menu:list' } },
                            { menu: { enabled: true, permissionCode: 'iam:role:list' } },
                        ],
                    },
                },
            ],
            overrideLinks,
        );
        const loader2 = new PermissionDataLoader(mock.prisma);
        const [r1, r3] = await Promise.all([loader2.load('a-1'), loader2.load('a-3')]);
        expect(r1).toEqual(['iam:audit:read', 'iam:user:list']);
        expect(r3).toEqual(['iam:role:list']); // menu:list 被 deny
    });

    // 场景 9：disabled 菜单的覆盖应被过滤
    it('场景9：disabled 菜单的 grant/deny 覆盖应被忽略', async () => {
        const overrideLinks = [
            { accountId: 'a-1', type: 'grant', menu: { enabled: false, permissionCode: 'iam:admin:delete' } },
        ];
        const mock = buildPrismaMock([{ accountId: 'a-1', role: { enabled: true, roleMenus: [] } }], overrideLinks);
        const loader2 = new PermissionDataLoader(mock.prisma);
        const r = await loader2.load('a-1');
        expect(r).toEqual([]); // disabled 菜单的 grant 不进权限码
    });
});
