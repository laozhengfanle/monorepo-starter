/**
 * AuthService 单元测试（Post-Audit Polish Task 4 重构后）
 *
 * 覆盖场景：
 * - adminLogin: 成功/密码错误/锁定/账号禁用/不泄露账号存在/首次登录标记
 * - memberSmsLogin: 成功(老用户)/成功(新用户)/账号禁用
 * - changePassword: 成功/旧密码错/新密码同旧
 * - issueTokens / refresh / logout: 已迁移到 TokenIssuanceService
 *   - 详见 token-issuance.service.spec.ts
 *
 * 拆分说明：
 * - AuthService 不再直接依赖 LoginLockService
 *   - 改为依赖 LoginLockIntegration（薄包装）
 *   - 测试 mock 也用 LoginLockIntegration 的接口（isLocked / recordFailure / resetOnSuccess / clear / getLockDurationMinutes）
 * - logout 已移到 TokenIssuanceService
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from '../auth.service.js';

// Mock 外部依赖
vi.mock('../../../common/utils/crypto.js', () => ({
    hashPassword: vi.fn().mockResolvedValue('$2b$10$hashed_mock'),
    verifyPassword: vi.fn(),
}));

vi.mock('../../audit/audit.service.js', () => ({
    AuditService: vi.fn().mockImplementation(() => ({
        record: vi.fn().mockResolvedValue(undefined),
    })),
    /** vi.mock 也要导出 AUDIT_ACTIONS 常量（service 内部用了） */
    AUDIT_ACTIONS: {
        LOGIN_SUCCESS: 'login_success',
        LOGIN_FAILED: 'login_failed',
        LOGIN_LOCKED: 'login_locked',
        LOGOUT: 'logout',
        RESET_PASSWORD: 'reset_password',
        PASSWORD_CHANGED: 'password_changed',
    },
}));

import { verifyPassword } from '../../../common/utils/crypto.js';

// ── 辅助工厂 ──

/**
 * 创建 TokenIssuanceService mock
 * - adminLogin / memberSmsLogin 内部通过 tokenIssuance.issueTokens() 签发 Token
 * - 行为应模拟真实实现：返回 accessToken / refreshToken / expiresIn
 */
function createMockTokenIssuance() {
    return {
        issueTokens: vi.fn().mockResolvedValue({
            accessToken: 'access-token-value',
            refreshToken: 'refresh-token-value',
            expiresIn: 900,
        }),
    };
}

function createMockCache() {
    return {
        get: vi.fn(),
        set: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
        delMany: vi.fn(),
        delByPattern: vi.fn(),
        mget: vi.fn(),
        setTtlByPattern: vi.fn(),
        exists: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        evalLua: vi.fn(),
    };
}

function createMockAccountService() {
    return {
        findByIdentity: vi.fn(),
        createMemberAccount: vi.fn(),
        updateLastLogin: vi.fn(),
        /**
         * changePassword 调用 updateIdentityCredential 更新密码哈希
         * - mock 默认 resolve
         */
        updateIdentityCredential: vi.fn().mockResolvedValue({ id: 'ident-1', credential: 'new_hash' }),
    };
}

/**
 * 创建 LoginLockIntegration mock（Post-Audit Polish Task 4 重构后）
 * - AuthService 不再直接 mock LoginLockService
 * - 这里 mock 的是 LoginLockIntegration 暴露的接口（与 LoginLockService 一致）
 */
function createMockLoginLockIntegration() {
    return {
        isLocked: vi.fn().mockResolvedValue(false),
        recordFailure: vi.fn().mockResolvedValue({ locked: false }),
        resetOnSuccess: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        getLockDurationMinutes: vi.fn().mockResolvedValue(30),
    };
}

function createMockTokenBlacklistService() {
    return {
        revokeAccountTokens: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockPrisma() {
    return {
        client: {
            accountIdentity: {
                findFirst: vi.fn(),
                update: vi.fn(),
            },
        },
    };
}

describe('AuthService', () => {
    let service: AuthService;
    let mockCache: ReturnType<typeof createMockCache>;
    let mockAccount: ReturnType<typeof createMockAccountService>;
    let mockLoginLock: ReturnType<typeof createMockLoginLockIntegration>;
    let mockTokenBlacklist: ReturnType<typeof createMockTokenBlacklistService>;
    let mockPrismaClient: ReturnType<typeof createMockPrisma>;
    let mockTokenIssuance: ReturnType<typeof createMockTokenIssuance>;

    beforeEach(() => {
        mockCache = createMockCache();
        mockAccount = createMockAccountService();
        mockLoginLock = createMockLoginLockIntegration();
        mockTokenBlacklist = createMockTokenBlacklistService();
        mockPrismaClient = createMockPrisma();
        mockTokenIssuance = createMockTokenIssuance();

        service = new AuthService(
            mockCache as any,
            mockAccount as any,
            mockLoginLock as any,
            { record: vi.fn().mockResolvedValue(undefined) } as any,
            mockTokenIssuance as any,
            mockTokenBlacklist as any,
            mockPrismaClient as any,
        );
    });

    // ════════════════════════════════════════════════════════════════
    // adminLogin
    // ════════════════════════════════════════════════════════════════

    describe('adminLogin', () => {
        const validIdentity = {
            account: { id: 'acc-1', enabled: true, userType: 'admin', lastLoginAt: new Date() },
            credential: '$2b$10$old_hash',
        };

        it('应成功登录并签发双Token（委托给 TokenIssuanceService）', async () => {
            mockAccount.findByIdentity.mockResolvedValue(validIdentity);
            (verifyPassword as any).mockResolvedValue(true);

            const result = await service.adminLogin('admin', 'password123', '127.0.0.1');

            expect(result.accessToken).toBe('access-token-value');
            expect(result.refreshToken).toBe('refresh-token-value');
            expect(result.expiresIn).toBe(900);
            expect(result.mustChangePassword).toBe(false);
            expect(mockLoginLock.resetOnSuccess).toHaveBeenCalledWith('acc-1');
            expect(mockAccount.updateLastLogin).toHaveBeenCalledWith('acc-1', '127.0.0.1');
            /** Token 签发应委托给 TokenIssuanceService */
            expect(mockTokenIssuance.issueTokens).toHaveBeenCalledWith('acc-1', 'admin');
        });

        it('首次登录应返回 mustChangePassword=true', async () => {
            const firstLoginIdentity = {
                account: { id: 'acc-2', enabled: true, userType: 'admin', lastLoginAt: null },
                credential: '$2b$10$old_hash',
            };
            mockAccount.findByIdentity.mockResolvedValue(firstLoginIdentity);
            (verifyPassword as any).mockResolvedValue(true);

            const result = await service.adminLogin('newadmin', 'Init@123456', '127.0.0.1');

            expect(result.mustChangePassword).toBe(true);
        });

        it('密码错误应抛出异常并记录失败', async () => {
            mockAccount.findByIdentity.mockResolvedValue(validIdentity);
            (verifyPassword as any).mockResolvedValue(false);

            await expect(service.adminLogin('admin', 'wrongpass', '127.0.0.1')).rejects.toThrow(BadRequestException);
            expect(mockLoginLock.recordFailure).toHaveBeenCalledWith('acc-1', '127.0.0.1');
        });

        it('账号锁定时应抛出异常', async () => {
            mockAccount.findByIdentity.mockResolvedValue(validIdentity);
            mockLoginLock.isLocked.mockResolvedValue(true);

            await expect(service.adminLogin('admin', 'password123', '127.0.0.1')).rejects.toThrow(BadRequestException);
        });

        it('账号被禁用时应抛出异常', async () => {
            const disabledIdentity = {
                account: { id: 'acc-1', enabled: false, userType: 'admin' },
                credential: '$2b$10$old_hash',
            };
            mockAccount.findByIdentity.mockResolvedValue(disabledIdentity);
            (verifyPassword as any).mockResolvedValue(true);

            await expect(service.adminLogin('admin', 'password123', '127.0.0.1')).rejects.toThrow(BadRequestException);
        });

        it('账号不存在时应返回统一错误（不泄露账号存在性）', async () => {
            mockAccount.findByIdentity.mockResolvedValue(null);

            await expect(service.adminLogin('nonexistent', 'anything', '127.0.0.1')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('锁定触发后应记录锁定阈值', async () => {
            mockAccount.findByIdentity.mockResolvedValue(validIdentity);
            (verifyPassword as any).mockResolvedValue(false);
            mockLoginLock.recordFailure.mockResolvedValue({ locked: true });

            await expect(service.adminLogin('admin', 'wrong', '127.0.0.1')).rejects.toThrow('账号已锁定');
        });
    });

    // ════════════════════════════════════════════════════════════════
    // memberSmsLogin
    // 验证码校验已迁移到 SmsService，本方法只负责：查/建账户 + 签发 Token
    // ════════════════════════════════════════════════════════════════

    describe('memberSmsLogin', () => {
        const phone = '13800138000';

        beforeEach(() => {
            mockCache.get.mockResolvedValue(null);
        });

        it('老用户应成功登录', async () => {
            mockAccount.findByIdentity.mockResolvedValue({
                account: { id: 'mem-1', enabled: true, userType: 'member' },
            });

            const result = await service.memberSmsLogin(phone, '127.0.0.1');

            expect(result.accessToken).toBe('access-token-value');
            expect(result.refreshToken).toBe('refresh-token-value');
            expect(result.isNewUser).toBe(false);
            /** Token 签发应委托给 TokenIssuanceService（userType 固定为 'member'） */
            expect(mockTokenIssuance.issueTokens).toHaveBeenCalledWith('mem-1', 'member');
        });

        it('新用户应自动注册并返回 isNewUser=true', async () => {
            mockAccount.findByIdentity.mockResolvedValue(null);
            mockAccount.createMemberAccount.mockResolvedValue({ id: 'mem-new' });

            const result = await service.memberSmsLogin(phone, '127.0.0.1');

            expect(result.isNewUser).toBe(true);
            expect(mockAccount.createMemberAccount).toHaveBeenCalledWith(phone);
            expect(mockTokenIssuance.issueTokens).toHaveBeenCalledWith('mem-new', 'member');
        });

        it('账号被禁用时应抛异常', async () => {
            mockAccount.findByIdentity.mockResolvedValue({
                account: { id: 'mem-1', enabled: false, userType: 'member' },
            });

            await expect(service.memberSmsLogin(phone, '127.0.0.1')).rejects.toThrow('账号已禁用');
        });
    });

    // ════════════════════════════════════════════════════════════════
    // changePassword
    // ════════════════════════════════════════════════════════════════

    describe('changePassword', () => {
        it('应验证旧密码 + 撤销 token + 清 loginLock + 写 audit log', async () => {
            mockPrismaClient.client.accountIdentity.findFirst.mockResolvedValue({
                id: 'ident-1',
                credential: '$2b$10$old_hash',
            });
            (verifyPassword as any).mockResolvedValueOnce(true); // oldMatch
            (verifyPassword as any).mockResolvedValueOnce(false); // sameAsOld（不同）

            const result = await service.changePassword({
                accountId: 'acc-1',
                oldPassword: 'Old@123',
                newPassword: 'New@456',
                ip: '127.0.0.1',
            });

            expect(result.success).toBe(true);
            /** 撤销 token */
            expect(mockTokenBlacklist.revokeAccountTokens).toHaveBeenCalledWith('acc-1', 'password_changed');
            /** 清 loginLock */
            expect(mockLoginLock.clear).toHaveBeenCalledWith('acc-1');
        });

        it('旧密码错误应抛 11002', async () => {
            mockPrismaClient.client.accountIdentity.findFirst.mockResolvedValue({
                id: 'ident-1',
                credential: '$2b$10$old_hash',
            });
            (verifyPassword as any).mockResolvedValue(false);

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'Wrong@123',
                    newPassword: 'New@456',
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('新密码与旧密码相同应抛 11003', async () => {
            mockPrismaClient.client.accountIdentity.findFirst.mockResolvedValue({
                id: 'ident-1',
                credential: '$2b$10$old_hash',
            });
            (verifyPassword as any).mockResolvedValueOnce(true); // oldMatch
            (verifyPassword as any).mockResolvedValueOnce(true); // sameAsOld

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'Same@123',
                    newPassword: 'Same@123',
                }),
            ).rejects.toThrow('新密码不能与旧密码相同');
        });
    });
});
