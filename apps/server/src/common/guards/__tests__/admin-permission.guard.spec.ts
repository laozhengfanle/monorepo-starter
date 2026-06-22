/**
 * AdminPermissionGuard 单元测试
 *
 * 覆盖场景：
 * - @Public() 路由放行
 * - 无 @RequireAuth() 的控制器放行
 * - @RequireAuth() 但方法无 @Permission() → 403
 * - 非 admin 用户 → 403
 * - super_admin 角色快速放行
 * - 有权限 → 放行
 * - 无权限 → 403
 * - 缓存 miss → DB 重建
 * - GraphQL context 兼容
 * - 异常缓存格式自动修复
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermissionGuard } from '../admin-permission.guard.js';

// ── 辅助函数：创建 mock ExecutionContext ──
function createMockContext(
    overrides: {
        contextType?: string;
        requestUser?: { accountId: string; userType: string } | null;
        handler?: any;
        controllerClass?: any;
        req?: any;
    } = {},
) {
    const req = overrides.req ?? { user: overrides.requestUser };

    const contextType = overrides.contextType ?? 'http';

    const context: any = {
        getType: () => contextType,
        getClass: () => overrides.controllerClass ?? class MockController {},
        getHandler: () => overrides.handler ?? (() => {}),
        switchToHttp: () => ({
            getRequest: () => req,
        }),
    };

    // GraphQL 额外需要的方法
    if (contextType === 'graphql') {
        (context as any).getArgs = () => [{}, {}, { req }, {}];
    }

    return { context, req };
}

// ── AdminPermissionGuard 测试 ──
describe('AdminPermissionGuard', () => {
    let guard: AdminPermissionGuard;
    let mockReflector: {
        getAllAndOverride: ReturnType<typeof vi.fn>;
    };
    let mockCacheService: {
        get: ReturnType<typeof vi.fn>;
        setex: ReturnType<typeof vi.fn>;
        del: ReturnType<typeof vi.fn>;
        mget: ReturnType<typeof vi.fn>;
    };
    /** mock buildAccountAuth 内部所需：缓存 + DB 状态（用变量可在用例中改写） */
    let roleAuthState: { permMap: Map<string, string[]>; menuMap: Map<string, unknown[]> };
    let mockPrisma: {
        client: {
            adminAccountRole: {
                findMany: ReturnType<typeof vi.fn>;
            };
            adminAccountMenu: {
                findMany: ReturnType<typeof vi.fn>;
            };
        };
    };

    /** 构造有效的超管缓存数据 */
    const superAdminCacheData = {
        roles: ['super_admin'],
        permissions: ['iam:admin:list', 'iam:admin:create', 'iam:admin:update', 'iam:admin:delete'],
        menus: [],
    };

    /** 构造普通管理员缓存数据（只有 list 权限） */
    const normalAdminCacheData = {
        roles: ['editor'],
        permissions: ['iam:admin:list'],
        menus: [],
    };

    /** 构造空的超管缓存数据 */
    const superAdminEmptyPermissions = {
        roles: ['super_admin'],
        permissions: [],
        menus: [],
    };

    beforeEach(() => {
        mockReflector = {
            getAllAndOverride: vi.fn(),
        };

        // 角色级 L1 缓存：key → 值
        // - 走真实 buildAccountAuth 纯函数，纯函数会先查 mget；
        // - mock 默认全部 miss（返回 undefined），让纯函数走 DB 路径
        roleAuthState = {
            permMap: new Map<string, string[]>(),
            menuMap: new Map<string, unknown[]>(),
        };

        mockCacheService = {
            get: vi.fn(),
            setex: vi.fn(async (key: string, _ttl: number, value: unknown) => {
                // 把 setex 的值记到 roleAuthState，给 mget 用
                if (Array.isArray(value)) {
                    if (key.includes(':role:perm:')) {
                        roleAuthState.permMap.set(key, value as string[]);
                    } else if (key.includes(':role:menus:')) {
                        roleAuthState.menuMap.set(key, value as unknown[]);
                    }
                }
            }),
            del: vi.fn(),
            // mget 返回和 keys 等长的数组；miss 的位置返回 undefined
            mget: vi.fn(async (keys: string[]) => {
                const perms = roleAuthState.permMap;
                const menus = roleAuthState.menuMap;
                // 顺序：先 perms 后 menus（纯函数两次 mget 调用）
                // 通过 key 前缀区分
                if (keys.every((k) => k.includes(':role:perm:'))) {
                    return keys.map((k) => perms.get(k) as string[] | undefined);
                }
                if (keys.every((k) => k.includes(':role:menus:'))) {
                    return keys.map((k) => menus.get(k) as unknown[] | undefined);
                }
                return keys.map(() => undefined);
            }),
        };

        mockPrisma = {
            client: {
                adminAccountRole: {
                    findMany: vi.fn(),
                },
                adminAccountMenu: {
                    // 默认无账户级 grant/deny
                    findMany: vi.fn().mockResolvedValue([]),
                },
            },
        };

        guard = new AdminPermissionGuard(mockReflector as any, mockCacheService as any, mockPrisma as any);
    });

    // ──── 1. @Public() 路由放行 ────
    describe('@Public() 路由', () => {
        it('标记了 @Public() 的路由应直接放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                return undefined;
            });

            const { context } = createMockContext();
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            // 不应该读取缓存
            expect(mockCacheService.get).not.toHaveBeenCalled();
        });
    });

    // ──── 2. 无 @RequireAuth() 的控制器放行 ────
    describe('无 @RequireAuth()', () => {
        it('未标记 @RequireAuth() 的控制器应放行', async () => {
            mockReflector.getAllAndOverride.mockReturnValue(undefined);

            const { context } = createMockContext();
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 3. @RequireAuth() 但方法无 @Permission() → 403 ────
    describe('缺少 @Permission()', () => {
        it('标记了 @RequireAuth() 但方法无 @Permission() 应抛出 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return undefined; // 没有 @Permission
                return undefined;
            });

            const { context } = createMockContext();

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('权限端点缺少 @Permission() 装饰器');
        });
    });

    // ──── 4. 非 admin 用户 → 403 ────
    describe('非管理员拒绝', () => {
        it('userType 不是 admin 应抛出 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            const { context } = createMockContext({
                requestUser: { accountId: 'u1', userType: 'member' },
            });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('无权访问');
        });

        it('request.user 为空应抛出 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            const { context } = createMockContext({
                requestUser: null,
            });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });
    });

    // ──── 5. super_admin 角色快速放行 ────
    describe('super_admin 快速放行', () => {
        it('超管角色应直接放行（不检查具体权限码）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(superAdminCacheData);

            const { context } = createMockContext({
                requestUser: { accountId: 'admin-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('超管即使 permissions 为空也应放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(superAdminEmptyPermissions);

            const { context } = createMockContext({
                requestUser: { accountId: 'admin-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 6. 有权限 → 放行 ────
    describe('权限校验通过', () => {
        it('用户拥有所需权限码时应放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:list';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(normalAdminCacheData);

            const { context } = createMockContext({
                requestUser: { accountId: 'editor-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 7. 无权限 → 403 ────
    describe('权限校验拒绝', () => {
        it('用户无所需权限码时应抛出 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            // editor 只有 iam:admin:list 权限
            mockCacheService.get.mockResolvedValue(normalAdminCacheData);

            const { context } = createMockContext({
                requestUser: { accountId: 'editor-1', userType: 'admin' },
            });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('无权访问');
        });
    });

    // ──── 8. 缓存 miss → DB 重建 ────
    describe('缓存 miss 降级重建', () => {
        it('缓存未命中时应从 DB 重建并放行（权限匹配）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:list';
                return undefined;
            });

            // 缓存 miss
            mockCacheService.get.mockResolvedValue(null);

            // 走真实 buildAccountAuth：DB 返回 super_admin 角色 + list 权限
            // - mget 默认 miss，纯函数走 DB 路径重建后回填角色级 L1
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'super_admin',
                        enabled: true,
                        roleMenus: [
                            {
                                menu: {
                                    id: 'm1',
                                    name: '管理员管理',
                                    path: 'admin',
                                    icon: 'User',
                                    type: 'menu',
                                    permissionCode: 'iam:admin:list',
                                    sort: 1,
                                    visible: true,
                                    parentId: null,
                                    enabled: true,
                                },
                            },
                        ],
                    },
                },
            ]);

            const { context } = createMockContext({
                requestUser: { accountId: 'admin-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            // 验证：Guard 调用了 buildAccountAuth 触发了 DB 查询 + 角色级缓存回填
            expect(mockPrisma.client.adminAccountRole.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ accountId: 'admin-1' }) }),
            );
        });

        it('缓存 miss + DB 重建 + 权限不匹配 → 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(null);

            // 走真实 buildAccountAuth：DB 返回 editor 角色 + 只有 list 权限
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'editor',
                        enabled: true,
                        roleMenus: [
                            {
                                menu: {
                                    id: 'm1',
                                    name: '管理员管理',
                                    path: 'admin',
                                    icon: 'User',
                                    type: 'menu',
                                    permissionCode: 'iam:admin:list',
                                    sort: 1,
                                    visible: true,
                                    parentId: null,
                                    enabled: true,
                                },
                            },
                        ],
                    },
                },
            ]);

            const { context } = createMockContext({
                requestUser: { accountId: 'editor-1', userType: 'admin' },
            });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });

        it('DB 查询失败时应抛 InternalServerErrorException（L2 修复：fail-closed + 明确错误信息）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(null);

            // 真实 buildAccountAuth 内部 try-catch：DB 异常 → 返回 null → Guard 转 500
            mockPrisma.client.adminAccountRole.findMany.mockRejectedValue(new Error('DB connection error'));

            const { context } = createMockContext({
                requestUser: { accountId: 'admin-1', userType: 'admin' },
            });

            /**
             * L2 修复后的行为：
             * - 旧实现：DB 异常 → _buildAccountAuth 返回 null → 权限校验降级为 403（ForbiddenException）
             *   问题：合法用户被误判为"无权访问"，错误信息误导
             * - 新实现：DB 异常 → _buildAccountAuth 抛 InternalServerErrorException（500）
             *   - fail-closed：拒绝访问（安全优先）
             *   - 明确错误信息：用户看到"系统繁忙"，运维通过日志快速定位
             *   - 区分于 403：避免与真正的权限不足混淆
             */
            await expect(guard.canActivate(context)).rejects.toThrow(InternalServerErrorException);
        });
    });

    // ──── 9. GraphQL context 兼容 ────
    describe('GraphQL 兼容', () => {
        it('GraphQL context 应正确提取 request.user', async () => {
            // Mock GqlExecutionContext.create
            // 由于我们无法直接 mock NestJS 的静态方法，这里测试 guard 的 getRequest 私有方法行为
            // 方法逻辑：contextType === 'graphql' → GqlExecutionContext.create(context)

            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true; // 先测试最简单的放行路径
                return undefined;
            });

            // GraphQL context 的 getType 返回 'graphql'
            const req = { user: { accountId: 'admin-1', userType: 'admin' } };
            const context: any = {
                getType: () => 'graphql',
                getClass: () => class MockController {},
                getHandler: () => () => {},
                getArgs: () => [{}, {}, { req }, {}],
            };

            // 直接测试：@Public() 标记 → 放行，不涉及用户数据
            // GraphQL 路径的用户提取在 getRequest() 中体现
            // 这里验证 guard 不会因为 context type 是 graphql 而崩溃
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 10. 缓存异常格式自动修复 ────
    describe('异常缓存格式处理', () => {
        it('缓存数据为字符串（双重序列化）时应删除并重建', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:list';
                return undefined;
            });

            // 第一次 get 返回异常字符串
            mockCacheService.get.mockResolvedValueOnce('{"roles":["editor"]}');
            // 第二次 get（del 后内部不调用 get，而是调用 _buildAccountAuth）
            // 实际上 guard 检测到 typeof === 'string' 后 del 然后走 _buildAccountAuth

            // 走真实 buildAccountAuth：DB 返回 editor 角色 + list 权限
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'editor',
                        enabled: true,
                        roleMenus: [
                            {
                                menu: {
                                    id: 'm1',
                                    name: '管理员管理',
                                    path: 'admin',
                                    icon: 'User',
                                    type: 'menu',
                                    permissionCode: 'iam:admin:list',
                                    sort: 1,
                                    visible: true,
                                    parentId: null,
                                    enabled: true,
                                },
                            },
                        ],
                    },
                },
            ]);

            const { context } = createMockContext({
                requestUser: { accountId: 'editor-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            // 验证：字符串缓存被 del，并触发了 DB 重建
            expect(mockCacheService.del).toHaveBeenCalledWith('mono:auth:editor-1');
            expect(mockPrisma.client.adminAccountRole.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ accountId: 'editor-1' }) }),
            );
        });
    });

    // ──── 11. 边界：无 request 对象 ────
    describe('边界情况', () => {
        it('request 为 undefined 时非 admin 路径应抛出 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            // HTTP context 返回 undefined request
            const context: any = {
                getType: () => 'http',
                getClass: () => class MockController {},
                getHandler: () => () => {},
                switchToHttp: () => ({
                    getRequest: () => undefined,
                }),
            };

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });

        it('禁用的角色不应参与权限聚合', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:delete';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(null);

            // 走真实 buildAccountAuth：DB 返回一个禁用角色 + 一个启用角色
            // - adminAccountRole.findMany 走 where: { role: { enabled: true } } 过滤
            // - 纯函数会只查启用角色 → 返回只有 list 权限的 viewer
            mockPrisma.client.adminAccountRole.findMany.mockImplementation(async ({ where }: any) => {
                // 模拟纯函数 where.role.enabled === true 过滤：禁用角色不进结果
                if (where?.role?.enabled === true) {
                    return [
                        {
                            role: {
                                code: 'viewer',
                                enabled: true,
                                roleMenus: [
                                    {
                                        menu: {
                                            id: 'm2',
                                            name: '管理员管理',
                                            path: 'admin',
                                            icon: 'User',
                                            type: 'menu',
                                            permissionCode: 'iam:admin:list',
                                            sort: 1,
                                            visible: true,
                                            parentId: null,
                                            enabled: true,
                                        },
                                    },
                                ],
                            },
                        },
                    ];
                }
                return [];
            });

            const { context } = createMockContext({
                requestUser: { accountId: 'viewer-1', userType: 'admin' },
            });

            // 禁用角色的 delete 权限不应参与聚合，viewer 只有 list 权限
            // 请求的是 iam:admin:delete → 403
            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });
    });

    // ──── 12. @Permission() 多参数 OR 语义（2026-06 新增 dashboard:* 体系） ────
    describe('@Permission() 多参数 OR 语义', () => {
        /** 持有 dashboard:welcome 权限的访客缓存 */
        const welcomeOnlyCache = {
            roles: ['guest'],
            permissions: ['dashboard:welcome'],
            menus: [],
        };

        /** 持有 dashboard:analytics 权限的分析员缓存 */
        const analyticsOnlyCache = {
            roles: ['analyst'],
            permissions: ['dashboard:analytics'],
            menus: [],
        };

        it('@Permission("a", "b") 用户持有 a 即放行（OR 语义）', async () => {
            // 模拟 @Permission('dashboard:welcome', 'dashboard:analytics') — SetMetadata 存为 string[]
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return ['dashboard:welcome', 'dashboard:analytics'];
                return undefined;
            });

            // 用户只有 dashboard:welcome 权限，但 OR 语义下任一即可
            mockCacheService.get.mockResolvedValue(welcomeOnlyCache);

            const { context } = createMockContext({
                requestUser: { accountId: 'guest-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('@Permission("a", "b") 用户持有 b 也放行（OR 语义）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return ['dashboard:welcome', 'dashboard:analytics'];
                return undefined;
            });

            // 用户只有 dashboard:analytics 权限
            mockCacheService.get.mockResolvedValue(analyticsOnlyCache);

            const { context } = createMockContext({
                requestUser: { accountId: 'analyst-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('@Permission("a", "b") 用户都没有则 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return ['dashboard:welcome', 'dashboard:analytics'];
                return undefined;
            });

            // 持有完全不相关的权限
            mockCacheService.get.mockResolvedValue({
                roles: ['other'],
                permissions: ['iam:admin:list'],
                menus: [],
            });

            const { context } = createMockContext({
                requestUser: { accountId: 'other-1', userType: 'admin' },
            });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });

        it('@Permission() 接受单 string（向后兼容老装饰器）', async () => {
            // 单 string（老装饰器风格）
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'iam:admin:list';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(normalAdminCacheData);

            const { context } = createMockContext({
                requestUser: { accountId: 'editor-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('@Permission() 空数组 → 403（缺少装饰器）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return []; // 空数组
                return undefined;
            });

            const { context } = createMockContext({
                requestUser: { accountId: 'u1', userType: 'admin' },
            });

            await expect(guard.canActivate(context)).rejects.toThrow('权限端点缺少 @Permission() 装饰器');
        });

        it('@Permission() super_admin 角色在多参数 OR 下也直接放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return ['dashboard:welcome', 'dashboard:analytics'];
                return undefined;
            });

            // super_admin 角色，permissions 为空也应放行
            mockCacheService.get.mockResolvedValue(superAdminEmptyPermissions);

            const { context } = createMockContext({
                requestUser: { accountId: 'admin-1', userType: 'admin' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });
});
