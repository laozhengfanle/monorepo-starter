/**
 * MemberPermissionGuard 单元测试
 *
 * 覆盖场景：
 * - @Public() 路由放行
 * - 无 @RequireAuth() 的控制器放行
 * - @RequireAuth() 但方法无 @Permission() → 403
 * - 非 member 用户 → 403
 * - request.user 为空 → 403
 * - svip 角色快速放行
 * - 有权限 → 放行
 * - 无权限 → 403
 * - 缓存 miss → DB 重建（通过 MemberRoleService）
 * - 缓存 miss + DB 异常 → 优雅降级
 * - GraphQL context 兼容
 * - 异常缓存格式（字符串）→ 删除并重建
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberPermissionGuard } from '../member-permission.guard.js';

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

// ── MemberPermissionGuard 测试 ──
describe('MemberPermissionGuard', () => {
    let guard: MemberPermissionGuard;
    let mockReflector: {
        getAllAndOverride: ReturnType<typeof vi.fn>;
    };
    let mockCacheService: {
        get: ReturnType<typeof vi.fn>;
        setex: ReturnType<typeof vi.fn>;
        del: ReturnType<typeof vi.fn>;
    };
    let mockPrisma: {
        client: {
            memberAccountRole: {
                findMany: ReturnType<typeof vi.fn>;
            };
        };
    };
    let mockMemberRoleService: {
        getAggregatedPermissions: ReturnType<typeof vi.fn>;
    };

    /** 构造 svip 缓存数据（C端超级用户） */
    const svipCacheData = {
        roles: ['svip'],
        permissions: ['member:content:read', 'member:content:write', 'member:content:delete'],
    };

    /** 构造普通会员缓存数据（只有 read 权限） */
    const normalMemberCacheData = {
        roles: ['normal'],
        permissions: ['member:content:read'],
    };

    /** 构造 vip 会员缓存数据（有 read + write 权限） */
    const vipCacheData = {
        roles: ['vip'],
        permissions: ['member:content:read', 'member:content:write'],
    };

    /** 构造空的 svip 缓存数据（权限列表为空，但角色是 svip） */
    const svipEmptyPermissions = {
        roles: ['svip'],
        permissions: [],
    };

    beforeEach(() => {
        mockReflector = {
            getAllAndOverride: vi.fn(),
        };

        mockCacheService = {
            get: vi.fn(),
            setex: vi.fn(),
            del: vi.fn(),
        };

        mockPrisma = {
            client: {
                memberAccountRole: {
                    findMany: vi.fn(),
                },
            },
        };

        mockMemberRoleService = {
            getAggregatedPermissions: vi.fn(),
        };

        guard = new MemberPermissionGuard(
            mockReflector as any,
            mockCacheService as any,
            mockPrisma as any,
            mockMemberRoleService as any,
        );
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

    // ──── 4. 非 member 用户 → 放行给下一个 Guard 处理 ────
    describe('非会员用户', () => {
        /**
         * 设计决策：本 Guard 只处理 member 用户类型，admin / guest 等放行
         * - 依据项目约束 "Global permission guards must return true (not throw) for non-target user types"
         * - 防止 admin 用户被 MemberPermissionGuard 误拦截（即使 AdminPermissionGuard 已通过 super_admin 放行）
         */
        it('userType 不是 member 应放行给下一个 Guard（不直接拒绝）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            const { context } = createMockContext({
                requestUser: { accountId: 'u1', userType: 'admin' },
            });

            // 期望：返回 true（让 AdminPermissionGuard 接手），而不是 throw 403
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 5. request.user 为空 → 放行给下一个 Guard 处理 ────
    describe('request.user 为空', () => {
        /**
         * 设计决策：request.user 为空时本 Guard 不抛错，让其他 Guard（如 GlobalExceptionFilter）处理
         * - 防止 JwtAuthGuard 没注入 user 时 MemberPermissionGuard 提前拦截
         */
        it('request.user 为空应放行给下一个 Guard', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            const { context } = createMockContext({
                requestUser: null,
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 6. svip 角色快速放行 ────
    describe('svip 快速放行', () => {
        it('svip 角色应直接放行（不检查具体权限码）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(svipCacheData);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('svip 即使 permissions 为空也应放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(svipEmptyPermissions);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 7. 有权限 → 放行 ────
    describe('权限校验通过', () => {
        it('用户拥有所需权限码时应放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:read';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(normalMemberCacheData);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 8. 无权限 → 403 ────
    describe('权限校验拒绝', () => {
        it('用户无所需权限码时应抛出 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            // normal 会员只有 read 权限，请求 delete 权限
            mockCacheService.get.mockResolvedValue(normalMemberCacheData);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('无权访问');
        });
    });

    // ──── 9. 缓存 miss → DB 重建（通过 MemberRoleService） ────
    describe('缓存 miss 降级重建', () => {
        it('缓存未命中时应通过 MemberRoleService 重建并放行（权限匹配）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:read';
                return undefined;
            });

            // 缓存 miss
            mockCacheService.get.mockResolvedValue(null);

            // 模拟 DB 返回 vip 角色数据
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'vip',
                        enabled: true,
                    },
                },
            ]);

            // 模拟 MemberRoleService 聚合权限码
            mockMemberRoleService.getAggregatedPermissions.mockResolvedValue([
                'member:content:read',
                'member:content:write',
            ]);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            // 验证调用了 MemberRoleService 聚合权限
            expect(mockMemberRoleService.getAggregatedPermissions).toHaveBeenCalledWith(['vip']);
            // 验证写入了缓存
            expect(mockCacheService.setex).toHaveBeenCalledWith(
                'mono:auth:member-1',
                expect.any(Number),
                expect.objectContaining({
                    roles: ['vip'],
                    permissions: expect.arrayContaining(['member:content:read', 'member:content:write']),
                }),
            );
        });

        it('缓存 miss + DB 重建 + svip 角色 → 直接放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            // 缓存 miss
            mockCacheService.get.mockResolvedValue(null);

            // 模拟 DB 返回 svip 角色
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'svip',
                        enabled: true,
                    },
                },
            ]);

            mockMemberRoleService.getAggregatedPermissions.mockResolvedValue([
                'member:content:read',
                'member:content:write',
                'member:content:delete',
            ]);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('缓存 miss + DB 重建 + 权限不匹配 → 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            // 缓存 miss
            mockCacheService.get.mockResolvedValue(null);

            // DB 返回 normal 角色
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'normal',
                        enabled: true,
                    },
                },
            ]);

            // normal 角色只有 read 权限
            mockMemberRoleService.getAggregatedPermissions.mockResolvedValue(['member:content:read']);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });

        it('禁用的角色不应参与权限聚合', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            // 缓存 miss
            mockCacheService.get.mockResolvedValue(null);

            // DB 返回一个禁用角色 + 一个启用角色
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'disabled_role',
                        enabled: false, // 禁用
                    },
                },
                {
                    role: {
                        code: 'normal',
                        enabled: true, // 启用但只有 read 权限
                    },
                },
            ]);

            // 只有 normal 角色的权限（禁用的角色被过滤掉了）
            mockMemberRoleService.getAggregatedPermissions.mockResolvedValue(['member:content:read']);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            // 禁用角色的 delete 权限不应参与聚合，normal 只有 read 权限
            // 请求的是 member:content:delete → 403
            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            // 验证只传了启用角色的 code 给 MemberRoleService
            expect(mockMemberRoleService.getAggregatedPermissions).toHaveBeenCalledWith(['normal']);
        });
    });

    // ──── 10. 缓存 miss + DB 异常 → 优雅降级 ────
    describe('DB 异常优雅降级', () => {
        it('DB 查询失败时应优雅降级返回 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            // 缓存 miss
            mockCacheService.get.mockResolvedValue(null);
            // DB 查询异常
            mockPrisma.client.memberAccountRole.findMany.mockRejectedValue(new Error('DB connection error'));

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            // DB 异常时 authData 为 null，走到权限校验 → 403
            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('无权访问');
        });

        it('MemberRoleService 聚合权限异常时应优雅降级返回 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
                return undefined;
            });

            // 缓存 miss
            mockCacheService.get.mockResolvedValue(null);

            // DB 查询角色成功
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'vip',
                        enabled: true,
                    },
                },
            ]);

            // 但 MemberRoleService 聚合权限时异常
            mockMemberRoleService.getAggregatedPermissions.mockRejectedValue(new Error('Redis error'));

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            // _buildMemberAuth 内部 catch 了异常，返回 null → 403
            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });
    });

    // ──── 11. GraphQL context 兼容 ────
    describe('GraphQL 兼容', () => {
        it('GraphQL context 应正确提取 request.user', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true; // 先测试最简单的放行路径
                return undefined;
            });

            // GraphQL context 的 getType 返回 'graphql'
            const req = { user: { accountId: 'member-1', userType: 'member' } };
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

        it('GraphQL context + 缓存命中 + 权限匹配应放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:read';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(vipCacheData);

            const req = { user: { accountId: 'member-1', userType: 'member' } };
            const context: any = {
                getType: () => 'graphql',
                getClass: () => class MockController {},
                getHandler: () => () => {},
                getArgs: () => [{}, {}, { req }, {}],
            };

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    // ──── 12. 异常缓存格式（字符串）→ 删除并重建 ────
    describe('异常缓存格式处理', () => {
        it('缓存数据为字符串（双重序列化）时应删除并重建', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:read';
                return undefined;
            });

            // 第一次 get 返回异常字符串
            mockCacheService.get.mockResolvedValueOnce('{"roles":["normal"]}');

            // DB 重建数据
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([
                {
                    role: {
                        code: 'normal',
                        enabled: true,
                    },
                },
            ]);

            mockMemberRoleService.getAggregatedPermissions.mockResolvedValue(['member:content:read']);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            // 验证删除了异常缓存
            expect(mockCacheService.del).toHaveBeenCalledWith('mono:auth:member-1');
            // 验证重建后写入了缓存
            expect(mockCacheService.setex).toHaveBeenCalledWith(
                'mono:auth:member-1',
                expect.any(Number),
                expect.objectContaining({
                    roles: ['normal'],
                    permissions: expect.arrayContaining(['member:content:read']),
                }),
            );
        });
    });

    // ──── 13. 边界：无 request 对象 ────
    describe('边界情况', () => {
        /**
         * 设计决策：request 为 undefined 时本 Guard 不抛错，让上游 Guard（如 JwtAuthGuard）处理
         * - 当 HTTP context 缺少 request 对象时，本 Guard 放行，由框架级处理
         */
        it('request 为 undefined 时应放行给下一个 Guard', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:delete';
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

            // 期望：放行（让 JwtAuthGuard 等上游 Guard 处理）
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('缓存数据为 null 且无角色时应拒绝访问', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return undefined;
                if (key === 'requireAuth') return true;
                if (key === 'permission') return 'member:content:read';
                return undefined;
            });

            // 缓存 miss
            mockCacheService.get.mockResolvedValue(null);

            // DB 返回空角色列表（用户没有任何角色）
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([]);

            // 无角色，MemberRoleService 返回空权限
            mockMemberRoleService.getAggregatedPermissions.mockResolvedValue([]);

            const { context } = createMockContext({
                requestUser: { accountId: 'member-1', userType: 'member' },
            });

            // 无角色无权限 → 403
            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });
    });
});
