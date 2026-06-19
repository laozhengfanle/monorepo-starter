/**
 * AdminPermissionCacheService 单元测试
 *
 * 覆盖场景（计划要求 ≥ 80% 覆盖率）：
 * - getAccountAuth: 缓存命中 / 缓存 miss 降级重建
 * - buildAccountAuth: 角色权限聚合 + 菜单树构建 + 多级缓存写入
 * - buildAccountAuth: 账户级覆盖（grant/deny）纳入聚合
 * - invalidateAccount: 单账户缓存失效
 * - invalidateRole: 角色级缓存 + 级联失效所有关联账户（delMany）
 * - invalidateMenuStructure: 角色级缓存删除 + 账户级 TTL 缩短防雪崩
 * - updateRoleAccounts: 角色账户映射更新
 * - 边界条件：空角色、禁用角色过滤
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminPermissionCacheService } from '../admin-permission-cache.service.js';

// ── 辅助工厂函数 ──
function createMockCacheService() {
    return {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
        delMany: vi.fn(),
        delByPattern: vi.fn(),
        setTtlByPattern: vi.fn(),
        mget: vi.fn(),
        exists: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        evalLua: vi.fn(),
        set: vi.fn(),
    };
}

function createMockPrisma() {
    return {
        client: {
            adminAccountRole: {
                findMany: vi.fn(),
            },
            adminAccountMenu: {
                findMany: vi.fn(),
            },
        },
    };
}

/** 构造角色菜单 DB 返回数据 */
function makeRoleMenu(
    menuData: Partial<{
        id: string;
        name: string;
        type: string;
        permissionCode: string;
        parentId: string | null;
        sort: number;
        path: string;
        icon: string;
        routeName: string;
        visible: boolean;
        keepAlive: boolean;
        enabled: boolean;
    }>,
) {
    return {
        menu: {
            id: menuData.id ?? 'm1',
            name: menuData.name ?? '测试菜单',
            type: menuData.type ?? 'menu',
            permissionCode: menuData.permissionCode ?? 'iam:test:list',
            parentId: menuData.parentId ?? null,
            sort: menuData.sort ?? 1,
            path: menuData.path ?? '/test',
            routeName: menuData.routeName ?? '',
            icon: menuData.icon ?? '',
            visible: menuData.visible ?? true,
            keepAlive: menuData.keepAlive ?? true,
            enabled: menuData.enabled ?? true,
        },
    };
}

// ── AdminPermissionCacheService 测试 ──
describe('AdminPermissionCacheService', () => {
    let service: AdminPermissionCacheService;
    let mockCache: ReturnType<typeof createMockCacheService>;
    let mockPrisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
        mockCache = createMockCacheService();
        mockPrisma = createMockPrisma();
        service = new AdminPermissionCacheService(mockCache as any, mockPrisma as any);
    });

    // ──── getAccountAuth ────
    describe('getAccountAuth()', () => {
        it('缓存命中 + 版本号一致时应直接返回缓存数据', async () => {
            // 当前菜单版本号 = 1
            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:data:menu_version') return Promise.resolve(1);
                return Promise.resolve(null);
            });
            const cachedData = {
                roles: ['super_admin'],
                permissions: ['iam:admin:list', 'iam:admin:delete'],
                menus: [],
                menuVersion: 1, // 与当前版本一致 → 缓存有效
            };
            // 第一次 get 拿账户缓存，第二次 get 拿版本号
            let getCallIndex = 0;
            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:auth:account-1') {
                    return Promise.resolve(cachedData);
                }
                if (key === 'mono:data:menu_version') {
                    return Promise.resolve(1);
                }
                return Promise.resolve(null);
            });

            const result = await service.getAccountAuth('account-1');
            expect(result).toEqual(cachedData);
            // 不应该查 DB（缓存有效）
            expect(mockPrisma.client.adminAccountRole.findMany).not.toHaveBeenCalled();
            // 不应该删缓存
            expect(mockCache.del).not.toHaveBeenCalled();
        });

        it('缓存命中但版本号不一致时应触发懒失效（删缓存 + 重建）', async () => {
            // 缓存里 menuVersion=1，但当前已 bump 到 2
            const staleCachedData = {
                roles: ['super_admin'],
                permissions: ['iam:admin:list'],
                menus: [],
                menuVersion: 1, // 旧版本
            };
            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:auth:account-1') return Promise.resolve(staleCachedData);
                if (key === 'mono:data:menu_version') return Promise.resolve(2); // 新版本
                return Promise.resolve(null);
            });

            // 重建路径需要 DB 数据
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'super_admin',
                        enabled: true,
                        roleMenus: [makeRoleMenu({ permissionCode: 'iam:admin:list' })],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            await service.getAccountAuth('account-1');

            // 旧缓存被删除
            expect(mockCache.del).toHaveBeenCalledWith('mono:auth:account-1');
            // 重建后写入了新缓存
            expect(mockCache.setex).toHaveBeenCalled();
        });

        it('旧缓存（无 menuVersion 字段）应被视为脏数据并重建', async () => {
            // 模拟旧版缓存（v1 升级前没有 menuVersion 字段）
            const oldCachedData = {
                roles: ['super_admin'],
                permissions: ['iam:admin:list'],
                menus: [],
                // 故意没有 menuVersion 字段
            } as any;
            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:auth:account-1') return Promise.resolve(oldCachedData);
                if (key === 'mono:data:menu_version') return Promise.resolve(1); // 当前有版本号
                return Promise.resolve(null);
            });

            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'super_admin',
                        enabled: true,
                        roleMenus: [makeRoleMenu({ permissionCode: 'iam:admin:list' })],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            await service.getAccountAuth('account-1');

            // 旧缓存被删除（menuVersion 缺失 → 视为 0 → 与非零当前版本比对必失败）
            expect(mockCache.del).toHaveBeenCalledWith('mono:auth:account-1');
        });

        it('缓存 miss 时应调用 buildAccountAuth 重建', async () => {
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            // 模拟 DB 数据
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'editor',
                        enabled: true,
                        roleMenus: [makeRoleMenu({ permissionCode: 'iam:admin:list' })],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);

            // 角色级缓存也 miss
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            const result = await service.getAccountAuth('account-1');
            expect(result).toBeDefined();
            expect(result.roles).toEqual(['editor']);
            expect(result.permissions).toEqual(['iam:admin:list']);
            // 验证写入了缓存（账户级 + 角色级 + 角色账户映射）
            expect(mockCache.setex).toHaveBeenCalled();
        });
    });

    // ──── buildAccountAuth ────
    describe('buildAccountAuth()', () => {
        it('应正确聚合单角色的权限码', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'editor',
                        enabled: true,
                        roleMenus: [
                            makeRoleMenu({ id: 'm1', permissionCode: 'iam:admin:list' }),
                            makeRoleMenu({ id: 'm2', permissionCode: 'iam:admin:create' }),
                        ],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);
            // 角色级缓存 miss
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            const result = await service.buildAccountAuth('account-1');

            expect(result.roles).toEqual(['editor']);
            expect(result.permissions).toContain('iam:admin:list');
            expect(result.permissions).toContain('iam:admin:create');
            expect(result.permissions.length).toBe(2);

            // 验证写入角色级缓存（权限码 + 菜单）
            const setexCalls = mockCache.setex.mock.calls;
            // 至少有一次角色权限码缓存写入
            const permCall = setexCalls.find((c: any[]) => c[0] === 'mono:role:permission:admin:editor');
            expect(permCall).toBeDefined();
        });

        it('应正确聚合多角色的权限码并去重', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'editor',
                        enabled: true,
                        roleMenus: [
                            makeRoleMenu({ id: 'm1', permissionCode: 'iam:admin:list' }),
                            makeRoleMenu({ id: 'm2', permissionCode: 'iam:role:list' }),
                        ],
                    },
                },
                {
                    role: {
                        code: 'viewer',
                        enabled: true,
                        roleMenus: [
                            makeRoleMenu({ id: 'm3', permissionCode: 'iam:role:list' }), // 重复
                            makeRoleMenu({ id: 'm4', permissionCode: 'iam:menu:list' }),
                        ],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            const result = await service.buildAccountAuth('account-2');

            expect(result.roles).toEqual(['editor', 'viewer']);
            // iam:role:list 去重后只出现一次
            expect(result.permissions).toEqual(['iam:admin:list', 'iam:role:list', 'iam:menu:list']);
        });

        it('空角色列表时应返回空数据', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);

            const result = await service.buildAccountAuth('ghost-account');

            expect(result.roles).toEqual([]);
            expect(result.permissions).toEqual([]);
            expect(result.menus).toEqual([]);
        });

        it('应处理 grant 覆盖（账户级额外权限）', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'viewer',
                        enabled: true,
                        roleMenus: [makeRoleMenu({ id: 'm1', permissionCode: 'iam:admin:list' })],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([
                {
                    menu: { id: 'm10', permissionCode: 'iam:admin:create' },
                    type: 'grant',
                },
            ]);
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            const result = await service.buildAccountAuth('account-3');

            // grant 追加了 iam:admin:create
            expect(result.permissions).toContain('iam:admin:list');
            expect(result.permissions).toContain('iam:admin:create');
        });

        it('应处理 deny 覆盖（账户级禁止权限）', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'editor',
                        enabled: true,
                        roleMenus: [
                            makeRoleMenu({ id: 'm1', permissionCode: 'iam:admin:list' }),
                            makeRoleMenu({ id: 'm2', permissionCode: 'iam:admin:delete' }),
                        ],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([
                {
                    menu: { id: 'm2', permissionCode: 'iam:admin:delete' },
                    type: 'deny',
                },
            ]);
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            const result = await service.buildAccountAuth('account-4');

            // deny 移除了 iam:admin:delete
            expect(result.permissions).toContain('iam:admin:list');
            expect(result.permissions).not.toContain('iam:admin:delete');
        });

        it('角色级缓存命中时应跳过 DB 角色菜单查询', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'editor',
                        enabled: true,
                        roleMenus: [], // 缓存命中时不使用这些数据
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);

            // 角色级缓存命中（mget 批量读取，返回对应的缓存数据）
            mockCache.mget.mockImplementation((keys: string[]) => {
                // 第一个参数是 permKeys，第二个是 menusKeys
                // 都返回一个元素的数组（对应 1 个角色）
                if (keys.length === 1 && keys[0]?.startsWith('mono:role:permission')) {
                    return Promise.resolve([['iam:admin:list', 'iam:admin:create']]);
                }
                return Promise.resolve([[{ id: 'm1', name: '管理员管理', type: 'menu' }]]);
            });

            const result = await service.buildAccountAuth('account-5');

            expect(result.permissions).toContain('iam:admin:list');
            expect(result.permissions).toContain('iam:admin:create');
            // 使用缓存中的权限码聚合，不应使用 DB roleMenus 数据
        });

        it('禁用的角色不应参与权限聚合（与 Guard._buildAccountAuth 行为一致）', async () => {
            // Prisma 查询已加 role: { enabled: true } 过滤，禁用角色根本不会被查出来
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                // disabled_role 被 Prisma where 过滤掉了，不会出现在结果中
                {
                    role: {
                        code: 'viewer',
                        enabled: true,
                        roleMenus: [makeRoleMenu({ permissionCode: 'iam:admin:list' })],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));

            const result = await service.buildAccountAuth('account-6');

            expect(result.roles).toEqual(['viewer']);
            expect(result.permissions).toEqual(['iam:admin:list']);
        });

        it('应写入账户级缓存（30 分钟 TTL）', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'editor',
                        enabled: true,
                        roleMenus: [makeRoleMenu({ permissionCode: 'iam:admin:list' })],
                    },
                },
            ]);
            mockPrisma.client.adminAccountMenu.findMany.mockResolvedValue([]);
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null));
            // 菜单版本号 = 5（嵌入账户缓存）
            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:data:menu_version') return Promise.resolve(5);
                return Promise.resolve(null);
            });

            await service.buildAccountAuth('account-7');

            // 验证账户级缓存写入（30 min = 1800s）
            const accountCacheCall = mockCache.setex.mock.calls.find((c: any[]) => c[0] === 'mono:auth:account-7');
            expect(accountCacheCall).toBeDefined();
            expect(accountCacheCall[1]).toBe(1800); // 30 minutes TTL
            // 验证 menuVersion 被嵌入（值为 5）
            const cachedData = accountCacheCall[2];
            expect(cachedData.menuVersion).toBe(5);
        });
    });

    // ──── bumpMenuVersion + getCurrentMenuVersion ────
    describe('菜单版本号', () => {
        it('getCurrentMenuVersion 应返回当前版本号（无 key 时返回 0）', async () => {
            // 第一次：无 key → 返回 null
            mockCache.get.mockResolvedValueOnce(null);
            expect(await service.getCurrentMenuVersion()).toBe(0);

            // 第二次：已有 key → 返回 7
            mockCache.get.mockResolvedValueOnce(7);
            expect(await service.getCurrentMenuVersion()).toBe(7);
        });

        it('bumpMenuVersion 应 INCR 并返回新值', async () => {
            mockCache.incr.mockResolvedValueOnce(3);
            const newVersion = await service.bumpMenuVersion();
            expect(newVersion).toBe(3);
            expect(mockCache.incr).toHaveBeenCalledWith('mono:data:menu_version');
        });
    });

    // ──── invalidateAccount ────
    describe('invalidateAccount()', () => {
        it('应删除单个账户的认证缓存', async () => {
            await service.invalidateAccount('account-1');

            expect(mockCache.del).toHaveBeenCalledWith('mono:auth:account-1');
            expect(mockCache.del).toHaveBeenCalledTimes(1);
        });
    });

    // ──── invalidateRole ────
    describe('invalidateRole()', () => {
        it('应删除角色级缓存 + 级联失效所有关联账户缓存', async () => {
            // 模拟角色账户映射存在
            mockCache.get.mockResolvedValueOnce(['account-1', 'account-2', 'account-3']);

            await service.invalidateRole('editor');

            // 删除了角色权限码缓存
            expect(mockCache.del).toHaveBeenCalledWith('mono:role:permission:admin:editor');
            // 删除了角色菜单缓存
            expect(mockCache.del).toHaveBeenCalledWith('mono:role:menus:admin:editor');
            // 读取了角色账户映射
            expect(mockCache.get).toHaveBeenCalledWith('mono:role:accounts:admin:editor');
            // 批量删除关联账户缓存
            expect(mockCache.delMany).toHaveBeenCalledWith([
                'mono:auth:account-1',
                'mono:auth:account-2',
                'mono:auth:account-3',
            ]);
        });

        it('角色无关联账户时只删除角色级缓存', async () => {
            // 角色级缓存也 miss（mget 用于批量读取，返回对应数量的 null）
            mockCache.mget.mockImplementation((keys: string[]) => keys.map(() => null)); // 无角色账户映射

            await service.invalidateRole('empty-role');

            expect(mockCache.del).toHaveBeenCalledWith('mono:role:permission:admin:empty-role');
            expect(mockCache.del).toHaveBeenCalledWith('mono:role:menus:admin:empty-role');
            // 没有调用 delMany
            expect(mockCache.delMany).not.toHaveBeenCalled();
        });
    });

    // ──── invalidateMenuStructure ────
    describe('invalidateMenuStructure()', () => {
        it('应删除所有角色级缓存 + 缩短账户级缓存 TTL 至 5 分钟', async () => {
            await service.invalidateMenuStructure();

            // 删除角色级权限码缓存
            expect(mockCache.delByPattern).toHaveBeenCalledWith('mono:role:permission:admin:*');
            // 删除角色级菜单缓存
            expect(mockCache.delByPattern).toHaveBeenCalledWith('mono:role:menus:admin:*');
            // 账户级缓存缩短 TTL
            expect(mockCache.setTtlByPattern).toHaveBeenCalledWith('mono:auth:*', 300);
        });
    });

    // ──── updateRoleAccounts ────
    describe('updateRoleAccounts()', () => {
        it('应删除旧映射并写入新映射', async () => {
            await service.updateRoleAccounts('editor', ['account-1', 'account-2']);

            // 先删除旧映射
            expect(mockCache.del).toHaveBeenCalledWith('mono:role:accounts:admin:editor');
            // 写入新映射（30 分钟 TTL）
            expect(mockCache.setex).toHaveBeenCalledWith('mono:role:accounts:admin:editor', 1800, [
                'account-1',
                'account-2',
            ]);
        });

        it('空账户列表时应只删除不写入', async () => {
            await service.updateRoleAccounts('editor', []);

            expect(mockCache.del).toHaveBeenCalledWith('mono:role:accounts:admin:editor');
            // 空数组不写入 setex
            const setexCalls = mockCache.setex.mock.calls.filter(
                (c: any[]) => c[0] === 'mono:role:accounts:admin:editor',
            );
            expect(setexCalls.length).toBe(0);
        });
    });
});
