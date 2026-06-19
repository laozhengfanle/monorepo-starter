/**
 * 超级管理员保护单元测试
 *
 * 覆盖所有超管保护关键路径（计划要求 ≥ 100% 覆盖率）：
 *
 * AdminRoleService:
 * - 删除 super_admin 角色 → 403
 * - 禁用 super_admin 角色 → 403
 * - 删除非 super_admin 角色 → 成功
 * - 禁用非 super_admin 角色 → 成功
 * - removeRoleFromAccount: 唯一超管 → 403（事务内检查）
 * - removeRoleFromAccount: 多个超管 → 成功
 * - removeRoleFromAccount: 非超管角色 → 成功
 *
 * AdminAccountService（账户级超管保护）:
 * - 禁用唯一超管账户 → 403
 * - 软删除唯一超管账户 → 403
 * - assignRoles 移除唯一超管 → 403
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

// Mock 模块依赖，避免深层 import 链问题
vi.mock('../../../common/utils/crypto.js', () => ({
    hashPassword: vi.fn().mockResolvedValue('$2b$10$hashed_mock'),
    verifyPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../audit/audit.service.js', () => ({
    AuditService: vi.fn().mockImplementation(() => ({
        record: vi.fn().mockResolvedValue(undefined),
    })),
    /**
     * 模拟细粒度 audit action 枚举（与 audit.service.ts 中的真实枚举对应）
     * 字符串值与 docs/数据库设计.md § 四.7 的 action 枚举保持一致
     */
    AUDIT_ACTIONS: {
        LOGIN_SUCCESS: 'login_success',
        LOGIN_FAILED: 'login_failed',
        LOGIN_LOCKED: 'login_locked',
        PASSWORD_CHANGED: 'password_changed',
        RESET_PASSWORD: 'reset_password',
        TOKEN_REFRESHED: 'token_refreshed',
        TOKEN_REUSED: 'token_reused',
        ACCOUNT_CREATED: 'account_created',
        ACCOUNT_UPDATED: 'account_updated',
        ACCOUNT_ENABLED: 'account_enabled',
        ACCOUNT_DISABLED: 'account_disabled',
        ACCOUNT_DELETED: 'account_deleted',
        ACCOUNT_HARD_DELETED: 'account_hard_deleted',
        ACCOUNT_RESTORED: 'account_restored',
        ROLE_CREATED: 'role_created',
        ROLE_UPDATED: 'role_updated',
        ROLE_DELETED: 'role_deleted',
        ROLE_HARD_DELETED: 'role_hard_deleted',
        ROLE_RESTORED: 'role_restored',
        ROLE_ASSIGNED: 'role_assigned',
        ROLE_REVOKED: 'role_revoked',
        MENU_CREATED: 'menu_created',
        MENU_UPDATED: 'menu_updated',
        MENU_DELETED: 'menu_deleted',
        MENU_HARD_DELETED: 'menu_hard_deleted',
        MENU_RESTORED: 'menu_restored',
        PERMISSION_CHANGED: 'permission_changed',
        ACCOUNT_PERMISSION_CHANGED: 'account_permission_changed',
        CONFIG_UPDATED: 'config_updated',
        FILE_UPLOADED: 'file_uploaded',
        FILE_DELETED: 'file_deleted',
        FILE_HARD_DELETED: 'file_hard_deleted',
        FILE_RESTORED: 'file_restored',
    },
}));

import { AdminRoleService } from '../admin-role/admin-role.service.js';
import { AdminAccountService } from '../admin-account/admin-account.service.js';

// ── 辅助函数：创建 mock Prisma 事务客户端 ──
function mockTx(overrides: Record<string, any> = {}) {
    return {
        adminRole: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            ...overrides.adminRole,
        },
        adminAccountRole: {
            count: vi.fn(),
            deleteMany: vi.fn(),
            findMany: vi.fn(),
            ...overrides.adminAccountRole,
        },
        adminRoleMenu: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
            ...overrides.adminRoleMenu,
        },
        account: {
            update: vi.fn(),
            ...overrides.account,
        },
        adminProfile: {
            update: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            ...overrides.adminProfile,
        },
        auditLog: {
            create: vi.fn(),
        },
        ...overrides,
    };
}

// ── AdminRoleService 超管保护测试 ──
describe('AdminRoleService — 超级管理员保护', () => {
    let service: AdminRoleService;
    let mockPrisma: any;
    let mockCacheService: any;

    beforeEach(() => {
        mockCacheService = {
            invalidateRole: vi.fn().mockResolvedValue(undefined),
            invalidateAccount: vi.fn().mockResolvedValue(undefined),
        };

        mockPrisma = {
            client: {
                adminRole: {
                    findMany: vi.fn().mockResolvedValue([]),
                    findUnique: vi.fn(),
                    findFirst: vi.fn(),
                    create: vi.fn(),
                    update: vi.fn(),
                },
                adminAccountRole: {
                    findMany: vi.fn(),
                    count: vi.fn(),
                    deleteMany: vi.fn(),
                },
                $transaction: vi.fn(),
            },
            /**
             * rawClient 暴露给：
             * - findUnique：找已软删的记录（绕过软删除拦截）
             * - delete：彻底删除
             */
            rawClient: {
                adminRole: {
                    findMany: vi.fn().mockResolvedValue([]),
                    findUnique: vi.fn(),
                    findFirst: vi.fn(),
                    delete: vi.fn(),
                },
            },
        };

        const mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
        service = new AdminRoleService(mockPrisma, mockCacheService, mockAudit);
    });

    // ──── 删除角色保护 ────
    describe('delete() — 删除角色保护', () => {
        it('删除 super_admin 角色应抛出 ForbiddenException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue({
                id: 'role-super',
                code: 'super_admin',
                name: '超级管理员',
            });

            await expect(service.delete('role-super')).rejects.toThrow(ForbiddenException);
            await expect(service.delete('role-super')).rejects.toThrow('超级管理员角色不可删除');
        });

        it('删除普通角色应成功（硬删除）', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue({
                id: 'role-editor',
                code: 'editor',
                name: '编辑者',
            });
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminRoleMenu: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
                    adminAccountRole: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
                    adminRole: { delete: vi.fn().mockResolvedValue(undefined) },
                };
                return cb(tx);
            });

            const result = await service.delete('role-editor');
            expect(result.deleted).toBe(true);
            expect(result.id).toBe('role-editor');
            // 验证缓存被失效
            expect(mockCacheService.invalidateRole).toHaveBeenCalledWith('editor');
        });

        it('删除不存在的角色应抛出 NotFoundException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(null);

            await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ──── 禁用角色保护 ────
    describe('update() — 禁用角色保护', () => {
        it('禁用 super_admin 角色应抛出 ForbiddenException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue({
                id: 'role-super',
                code: 'super_admin',
                name: '超级管理员',
                enabled: true,
            });

            await expect(service.update('role-super', { enabled: false })).rejects.toThrow(ForbiddenException);
            await expect(service.update('role-super', { enabled: false })).rejects.toThrow('超级管理员角色不可禁用');
        });

        it('禁用普通角色应成功', async () => {
            mockPrisma.client.adminRole.findUnique
                .mockResolvedValueOnce({ id: 'role-editor', code: 'editor', enabled: true }) // update() 中的 findUnique
                .mockResolvedValueOnce({
                    // findById() 中的 findUnique
                    id: 'role-editor',
                    code: 'editor',
                    name: '编辑者',
                    enabled: false,
                    description: '',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    _count: { roleMenus: 0 },
                    roleMenus: [],
                });
            mockPrisma.client.adminRole.update.mockResolvedValue({
                id: 'role-editor',
                code: 'editor',
                enabled: false,
            });

            const result = await service.update('role-editor', { enabled: false });
            expect(result.enabled).toBe(false);
            // 验证缓存被失效
            expect(mockCacheService.invalidateRole).toHaveBeenCalledWith('editor');
        });

        it('更新不存在的角色应抛出 NotFoundException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(null);

            await expect(service.update('nonexistent', { name: 'test' })).rejects.toThrow(NotFoundException);
        });
    });

    // ──── 移除账户角色保护 ────
    describe('removeRoleFromAccount() — 移除超管角色保护', () => {
        it('移除唯一超管的 super_admin 角色应抛出 ForbiddenException', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (fn: any) => {
                const tx = mockTx({
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue({
                            id: 'role-super',
                            code: 'super_admin',
                        }),
                    },
                    adminAccountRole: {
                        count: vi.fn().mockResolvedValue(1), // 只剩 1 个超管
                    },
                });
                return fn(tx);
            });

            await expect(service.removeRoleFromAccount('account-1', 'role-super')).rejects.toThrow(ForbiddenException);
            await expect(service.removeRoleFromAccount('account-1', 'role-super')).rejects.toThrow(
                '至少保留一个可用的超级管理员账户',
            );
        });

        it('有多个超管时移除其中一个应成功', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (fn: any) => {
                const tx = mockTx({
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue({
                            id: 'role-super',
                            code: 'super_admin',
                        }),
                    },
                    adminAccountRole: {
                        count: vi.fn().mockResolvedValue(3), // 还有 3 个超管
                        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                    },
                });
                return fn(tx);
            });

            await expect(service.removeRoleFromAccount('account-1', 'role-super')).resolves.toBeUndefined();
            // 验证缓存失效
            expect(mockCacheService.invalidateRole).toHaveBeenCalledWith('super_admin');
            expect(mockCacheService.invalidateAccount).toHaveBeenCalledWith('account-1');
        });

        it('移除非超管角色应成功（不触发超管保护检查）', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (fn: any) => {
                const tx = mockTx({
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue({
                            id: 'role-editor',
                            code: 'editor',
                        }),
                    },
                    adminAccountRole: {
                        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                    },
                });
                return fn(tx);
            });

            await expect(service.removeRoleFromAccount('account-1', 'role-editor')).resolves.toBeUndefined();
            // 验证缓存失效
            expect(mockCacheService.invalidateRole).toHaveBeenCalledWith('editor');
            expect(mockCacheService.invalidateAccount).toHaveBeenCalledWith('account-1');
        });
    });
});

// ── AdminAccountService 超管保护测试 ──
describe('AdminAccountService — 账户级超管保护', () => {
    let service: AdminAccountService;
    let mockPrisma: any;
    let mockCacheService: any;
    let mockAuditService: any;

    /** 构造一个 adminProfile 对象（模拟 DB 返回） */
    function mockProfile(overrides: Record<string, any> = {}) {
        return {
            id: overrides.id ?? 'profile-1',
            accountId: overrides.accountId ?? 'account-1',
            nickname: overrides.nickname ?? '测试用户',
            phone: overrides.phone ?? '',
            email: overrides.email ?? '',
            createdAt: new Date(),
            updatedAt: new Date(),
            account: {
                id: overrides.accountId ?? 'account-1',
                enabled: overrides.enabled ?? true,
                identities: [{ identifier: overrides.username ?? 'testuser' }],
                adminRoles: (overrides.roles ?? ['super_admin']).map((code: string) => ({
                    role: { code, enabled: true },
                })),
            },
        };
    }

    beforeEach(() => {
        mockCacheService = {
            invalidateAccount: vi.fn().mockResolvedValue(undefined),
            invalidateRole: vi.fn().mockResolvedValue(undefined),
        };

        mockAuditService = {
            record: vi.fn().mockResolvedValue(undefined),
        };

        mockPrisma = {
            client: {
                accountIdentity: {
                    findFirst: vi.fn(),
                },
                adminProfile: {
                    findUnique: vi.fn(),
                    findFirst: vi.fn(),
                    update: vi.fn(),
                    findMany: vi.fn(),
                },
                account: {
                    update: vi.fn(),
                },
                adminAccountRole: {
                    count: vi.fn(),
                    deleteMany: vi.fn(),
                    createMany: vi.fn(),
                    findMany: vi.fn(),
                },
                adminRole: {
                    findFirst: vi.fn(),
                    findMany: vi.fn(),
                },
                $transaction: vi.fn(),
            },
            /**
             * rawClient 暴露给：
             * - adminProfile.findUnique/findFirst：找已软删的记录（绕过软删除拦截）
             * - account.findUnique：同上
             * - account.delete：硬删账户
             * - adminAccountMenu.deleteMany / adminAccountRole.deleteMany：硬删级联
             */
            rawClient: {
                adminProfile: {
                    findUnique: vi.fn(),
                    findFirst: vi.fn(),
                    findMany: vi.fn(),
                    count: vi.fn(),
                },
                account: {
                    findUnique: vi.fn(),
                    delete: vi.fn(),
                },
                adminAccountMenu: {
                    deleteMany: vi.fn(),
                },
                adminAccountRole: {
                    deleteMany: vi.fn(),
                },
            },
        };

        service = new AdminAccountService(mockPrisma, mockCacheService, mockAuditService);
    });

    // ──── 禁用超管账户保护 ────
    describe('update() — 禁用账户保护', () => {
        it('禁用唯一超管账户应抛出 ForbiddenException（事务内检查）', async () => {
            const profile = mockProfile({ enabled: true, roles: ['super_admin'] });
            // update() 改用 rawClient.adminProfile.findUnique
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(profile);

            // 事务内：hasSuperAdminRoleInTx → true, activeSuperAdminCount → 1
            mockPrisma.client.$transaction.mockImplementation(async (fn: any) => {
                const tx = mockTx({
                    adminAccountRole: {
                        count: vi
                            .fn()
                            .mockResolvedValueOnce(1) // hasSuperAdminRoleInTx: count=1
                            .mockResolvedValueOnce(1), // activeSuperAdminCount: count=1
                    },
                });
                try {
                    await fn(tx);
                } catch (e) {
                    throw e; // re-throw to caller
                }
            });

            await expect(service.update('profile-1', { enabled: false })).rejects.toThrow(ForbiddenException);
        });
    });

    // ──── 软删除超管账户保护 ────
    describe('delete() — 软删除超管保护', () => {
        it('软删除唯一超管账户应抛出 ForbiddenException（事务内检查）', async () => {
            const profile = mockProfile();
            // delete() 改用 rawClient.adminProfile.findUnique
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(profile);

            mockPrisma.client.$transaction.mockImplementation(async (fn: any) => {
                const tx = mockTx({
                    adminAccountRole: {
                        count: vi
                            .fn()
                            .mockResolvedValueOnce(1) // hasSuperAdminRoleInTx
                            .mockResolvedValueOnce(1), // activeSuperAdminCount
                    },
                });
                try {
                    await fn(tx);
                } catch (e) {
                    throw e;
                }
            });

            await expect(service.delete('profile-1')).rejects.toThrow(ForbiddenException);
        });
    });

    // ──── assignRoles 移除超管保护 ────
    describe('assignRoles() — 移除超管角色保护', () => {
        it('assignRoles 移除唯一超管的角色应抛出 ForbiddenException', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (fn: any) => {
                const tx = mockTx({
                    adminRole: {
                        findFirst: vi.fn().mockResolvedValue({
                            id: 'role-super',
                            code: 'super_admin',
                        }),
                    },
                    adminAccountRole: {
                        count: vi
                            .fn()
                            .mockResolvedValueOnce(1) // checkRemovingSuperAdmin → existing count
                            .mockResolvedValueOnce(1), // activeSuperAdminCount
                    },
                });
                try {
                    await fn(tx);
                } catch (e) {
                    throw e;
                }
            });

            // 新角色列表不含 super_admin（roleIds 为空数组）
            await expect(service.assignRoles('account-1', ['role-editor'])).rejects.toThrow(ForbiddenException);
        });
    });
});
