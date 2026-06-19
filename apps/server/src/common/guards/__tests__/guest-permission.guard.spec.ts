/**
 * GuestPermissionGuard 单元测试
 *
 * 覆盖场景：
 * - 非 @Public() 端点 → 放行（由 MemberPermissionGuard 处理）
 * - @Public() 但无 @Permission() → 放行（完全公开）
 * - @Public() + @Permission() + 游客有权限 → 放行
 * - @Public() + @Permission() + 游客无权限 → 403
 * - 缓存命中 → 使用缓存的游客权限
 * - 缓存未命中 → 通过 MemberRoleService 重建
 * - 游客角色无任何权限 → 403
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GuestPermissionGuard } from '../guest-permission.guard.js';

// ── 辅助函数：创建 mock ExecutionContext ──
function createMockContext(
    overrides: {
        handler?: any;
        controllerClass?: any;
    } = {},
) {
    const context: any = {
        getClass: () => overrides.controllerClass ?? class MockController {},
        getHandler: () => overrides.handler ?? (() => {}),
    };
    return { context };
}

// ── GuestPermissionGuard 测试 ──
describe('GuestPermissionGuard', () => {
    let guard: GuestPermissionGuard;
    let mockReflector: {
        getAllAndOverride: ReturnType<typeof vi.fn>;
    };
    let mockCacheService: {
        get: ReturnType<typeof vi.fn>;
    };
    let mockMemberRoleService: {
        getRolePermissions: ReturnType<typeof vi.fn>;
    };

    /** 游客角色缓存键：mono:role:permission:member:guest */
    const GUEST_CACHE_KEY = 'mono:role:permission:member:guest';

    /** 构造有权限的游客缓存数据 */
    const guestCacheDataWithPermissions = {
        permissions: ['content:article:read', 'content:category:list'],
    };

    /** 构造无权限的游客缓存数据 */
    const guestCacheDataNoPermissions = {
        permissions: [],
    };

    beforeEach(() => {
        mockReflector = {
            getAllAndOverride: vi.fn(),
        };

        mockCacheService = {
            get: vi.fn(),
        };

        mockMemberRoleService = {
            getRolePermissions: vi.fn(),
        };

        guard = new GuestPermissionGuard(mockReflector as any, mockCacheService as any, mockMemberRoleService as any);
    });

    // ──── 1. 非 @Public() 端点 → 放行 ────
    describe('非 @Public() 端点', () => {
        it('未标记 @Public() 的端点应放行（由 MemberPermissionGuard 处理）', async () => {
            // isPublic 返回 false/undefined → 非 @Public() 端点
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return false;
                return undefined;
            });

            const { context } = createMockContext();
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            // 不应该读取缓存
            expect(mockCacheService.get).not.toHaveBeenCalled();
            // 不应该调用 MemberRoleService
            expect(mockMemberRoleService.getRolePermissions).not.toHaveBeenCalled();
        });

        it('isPublic 返回 undefined 时也应放行', async () => {
            mockReflector.getAllAndOverride.mockReturnValue(undefined);

            const { context } = createMockContext();
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
        });
    });

    // ──── 2. @Public() 但无 @Permission() → 放行 ────
    describe('@Public() 无 @Permission()', () => {
        it('标记了 @Public() 但没有 @Permission() 应放行（完全公开）', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return undefined;
                return undefined;
            });

            const { context } = createMockContext();
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            // 不应该读取缓存
            expect(mockCacheService.get).not.toHaveBeenCalled();
        });
    });

    // ──── 3. @Public() + @Permission() + 游客有权限 → 放行 ────
    describe('游客有权限', () => {
        it('游客角色包含所需权限码时应放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:article:read';
                return undefined;
            });

            // 缓存命中，返回有权限的数据
            mockCacheService.get.mockResolvedValue(guestCacheDataWithPermissions);

            const { context } = createMockContext();
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            // 验证使用了正确的缓存键
            expect(mockCacheService.get).toHaveBeenCalledWith(GUEST_CACHE_KEY);
        });

        it('游客拥有多个权限时，只要包含所需权限码就应放行', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:category:list';
                return undefined;
            });

            mockCacheService.get.mockResolvedValue(guestCacheDataWithPermissions);

            const { context } = createMockContext();
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
        });
    });

    // ──── 4. @Public() + @Permission() + 游客无权限 → 403 ────
    describe('游客无权限', () => {
        it('游客角色不包含所需权限码时应抛出 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:article:write';
                return undefined;
            });

            // 缓存命中，但游客没有 write 权限
            mockCacheService.get.mockResolvedValue(guestCacheDataWithPermissions);

            const { context } = createMockContext();

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('游客无权访问此内容');
        });
    });

    // ──── 5. 缓存命中 → 使用缓存的游客权限 ────
    describe('缓存命中', () => {
        it('缓存命中时应直接使用缓存数据，不调用 MemberRoleService', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:article:read';
                return undefined;
            });

            // 缓存命中
            mockCacheService.get.mockResolvedValue(guestCacheDataWithPermissions);

            const { context } = createMockContext();
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            // 验证读取了缓存
            expect(mockCacheService.get).toHaveBeenCalledWith(GUEST_CACHE_KEY);
            // 验证没有调用 MemberRoleService 重建
            expect(mockMemberRoleService.getRolePermissions).not.toHaveBeenCalled();
        });
    });

    // ──── 6. 缓存未命中 → 通过 MemberRoleService 重建 ────
    describe('缓存未命中重建', () => {
        it('缓存未命中时应通过 MemberRoleService 获取权限并校验', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:article:read';
                return undefined;
            });

            // 缓存未命中
            mockCacheService.get.mockResolvedValue(null);
            // MemberRoleService 返回游客权限
            mockMemberRoleService.getRolePermissions.mockResolvedValue(['content:article:read']);

            const { context } = createMockContext();
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            // 验证调用了 MemberRoleService 并传入 'guest'
            expect(mockMemberRoleService.getRolePermissions).toHaveBeenCalledWith('guest');
        });

        it('缓存未命中 + 重建后权限不匹配 → 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:article:write';
                return undefined;
            });

            // 缓存未命中
            mockCacheService.get.mockResolvedValue(null);
            // 重建后游客只有 read 权限
            mockMemberRoleService.getRolePermissions.mockResolvedValue(['content:article:read']);

            const { context } = createMockContext();

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('游客无权访问此内容');
            // 验证调用了 MemberRoleService
            expect(mockMemberRoleService.getRolePermissions).toHaveBeenCalledWith('guest');
        });
    });

    // ──── 7. 游客角色无任何权限 → 403 ────
    describe('游客角色无权限', () => {
        it('缓存中游客角色 permissions 为空数组时应抛出 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:article:read';
                return undefined;
            });

            // 缓存命中但权限为空
            mockCacheService.get.mockResolvedValue(guestCacheDataNoPermissions);

            const { context } = createMockContext();

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('游客无权访问此内容');
        });

        it('缓存未命中 + MemberRoleService 返回空数组 → 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:article:read';
                return undefined;
            });

            // 缓存未命中
            mockCacheService.get.mockResolvedValue(null);
            // 重建后游客无任何权限
            mockMemberRoleService.getRolePermissions.mockResolvedValue([]);

            const { context } = createMockContext();

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
            await expect(guard.canActivate(context)).rejects.toThrow('游客无权访问此内容');
        });

        it('缓存返回的 permissions 字段为 undefined → 403', async () => {
            mockReflector.getAllAndOverride.mockImplementation((key: string) => {
                if (key === 'isPublic') return true;
                if (key === 'permission') return 'content:article:read';
                return undefined;
            });

            // 缓存数据中没有 permissions 字段
            mockCacheService.get.mockResolvedValue({});

            const { context } = createMockContext();

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });
    });
});
