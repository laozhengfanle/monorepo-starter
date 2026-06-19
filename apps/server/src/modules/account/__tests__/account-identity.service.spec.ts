/**
 * AccountIdentityService 单元测试
 *
 * 覆盖场景：
 * - changePassword: 成功 / 旧密码错误 / 新密码与旧密码相同
 *   / 新密码长度不足 / 新密码长度超限 / 新密码缺少复杂度
 *   / 账户不存在或未设密码 / 频率限制
 * - bindPhone: 成功 / 已被其他账户绑定 / 已绑定当前账户
 * - unbindPhone: 成功 / 验证码错误 / 至少保留一种登录方式拒绝
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AccountIdentityService } from '../account-identity/account-identity.service.js';

// Mock bcrypt
vi.mock('../../../common/utils/crypto.js', () => ({
    hashPassword: vi.fn().mockResolvedValue('$2b$10$new_hash'),
    verifyPassword: vi.fn(),
}));

// Mock SmsService
vi.mock('../../../common/sms/sms.service.js', () => ({
    SmsService: vi.fn().mockImplementation(() => ({
        verifyCode: vi.fn().mockResolvedValue(true),
    })),
}));

// Mock @packages/shared (newId)
vi.mock('@packages/shared', () => ({
    newId: vi.fn(() => 'mocked-id-123'),
}));

// Mock AuditService
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
        PHONE_BIND: 'phone_bind',
        PHONE_UNBIND: 'phone_unbind',
        OAUTH_BIND: 'oauth_bind',
        OAUTH_UNBIND: 'oauth_unbind',
        ACCOUNT_CREATED: 'account_created',
        ACCOUNT_UPDATED: 'account_updated',
        ACCOUNT_ENABLED: 'account_enabled',
        ACCOUNT_DISABLED: 'account_disabled',
        ACCOUNT_DELETED: 'account_deleted',
        ROLE_CREATED: 'role_created',
        ROLE_UPDATED: 'role_updated',
        ROLE_DELETED: 'role_deleted',
        ROLE_ASSIGNED: 'role_assigned',
        ROLE_REVOKED: 'role_revoked',
        MENU_CREATED: 'menu_created',
        MENU_UPDATED: 'menu_updated',
        MENU_DELETED: 'menu_deleted',
        PERMISSION_CHANGED: 'permission_changed',
        ACCOUNT_PERMISSION_CHANGED: 'account_permission_changed',
        CONFIG_UPDATED: 'config_updated',
        FILE_UPLOADED: 'file_uploaded',
        FILE_DELETED: 'file_deleted',
    },
}));

import { hashPassword, verifyPassword } from '../../../common/utils/crypto.js';
import { SmsService } from '../../../common/sms/sms.service.js';

describe('AccountIdentityService', () => {
    let service: AccountIdentityService;
    let mockPrisma: { client: Record<string, any> };
    let mockCache: {
        del: ReturnType<typeof vi.fn>;
        delByPattern: ReturnType<typeof vi.fn>;
        setex: ReturnType<typeof vi.fn>;
        exists: ReturnType<typeof vi.fn>;
    };
    let mockSms: { verifyCode: ReturnType<typeof vi.fn> };
    let mockTokenBlacklist: { revokeAccountTokens: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockCache = {
            del: vi.fn().mockResolvedValue(undefined),
            delByPattern: vi.fn().mockResolvedValue(undefined),
            setex: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(false),
        };
        mockPrisma = {
            client: {
                accountIdentity: {
                    findFirst: vi.fn(),
                    findMany: vi.fn(),
                    update: vi.fn(),
                    create: vi.fn(),
                    delete: vi.fn(),
                    count: vi.fn(),
                },
            },
        };
        mockSms = {
            verifyCode: vi.fn().mockResolvedValue(true),
        };
        mockTokenBlacklist = {
            revokeAccountTokens: vi.fn().mockResolvedValue(undefined),
        };

        service = new AccountIdentityService(
            mockPrisma as any,
            mockCache as any,
            { record: vi.fn().mockResolvedValue(undefined) } as any,
            mockSms as any,
            mockTokenBlacklist as any,
        );
    });

    // ── changePassword ──

    describe('changePassword', () => {
        const identity = {
            id: 'identity-1',
            accountId: 'acc-1',
            credential: '$2b$10$old_hash',
        };

        beforeEach(() => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(identity);
        });

        it('应成功修改密码', async () => {
            (verifyPassword as any)
                .mockResolvedValueOnce(true) // 旧密码验证通过
                .mockResolvedValueOnce(false); // 新密码 ≠ 旧密码

            const result = await service.changePassword({
                accountId: 'acc-1',
                oldPassword: 'OldPass1',
                newPassword: 'NewPass1',
                ip: '127.0.0.1',
            });

            expect(result.success).toBe(true);
            expect(hashPassword).toHaveBeenCalledWith('NewPass1');
            expect(mockPrisma.client.accountIdentity.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'identity-1' },
                    data: { credential: '$2b$10$new_hash' },
                }),
            );
            // 验证 refresh token 被清除
            expect(mockCache.delByPattern).toHaveBeenCalledWith(expect.stringContaining('mono:refresh:used:acc-1'));
        });

        it('旧密码错误应抛出异常', async () => {
            (verifyPassword as any).mockResolvedValueOnce(false);

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'WrongPass1',
                    newPassword: 'NewPass1',
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('新密码与旧密码相同应抛出异常', async () => {
            (verifyPassword as any)
                .mockResolvedValueOnce(true) // 旧密码验证通过
                .mockResolvedValueOnce(true); // 新密码与旧密码相同

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'OldPass1',
                    newPassword: 'OldPass1',
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('新密码长度不足8位应抛出异常', async () => {
            (verifyPassword as any).mockResolvedValueOnce(true);

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'OldPass1',
                    newPassword: 'Ab1', // 只有3位
                }),
            ).rejects.toThrow(/8-32/);
        });

        it('新密码超过32位应抛出异常', async () => {
            (verifyPassword as any).mockResolvedValueOnce(true);

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'OldPass1',
                    newPassword: 'A'.repeat(33) + 'b1',
                }),
            ).rejects.toThrow(/8-32/);
        });

        it('新密码缺少大写字母应抛出异常', async () => {
            (verifyPassword as any).mockResolvedValueOnce(true);

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'OldPass1',
                    newPassword: 'alllowercase1', // 没有大写
                }),
            ).rejects.toThrow(/大写字母/);
        });

        it('新密码缺少小写字母应抛出异常', async () => {
            (verifyPassword as any).mockResolvedValueOnce(true);

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'OldPass1',
                    newPassword: 'ALLUPPERCASE1', // 没有小写
                }),
            ).rejects.toThrow(/小写字母/);
        });

        it('新密码缺少数字应抛出异常', async () => {
            (verifyPassword as any).mockResolvedValueOnce(true);

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'OldPass1',
                    newPassword: 'NoDigitsAtAll', // 没有数字
                }),
            ).rejects.toThrow(/数字/);
        });

        it('账户不存在应抛出异常', async () => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(null);

            await expect(
                service.changePassword({
                    accountId: 'nonexistent',
                    oldPassword: 'OldPass1',
                    newPassword: 'NewPass1',
                }),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('账户未设置密码应抛出异常', async () => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({
                id: 'identity-2',
                accountId: 'acc-2',
                credential: null,
            });

            await expect(
                service.changePassword({
                    accountId: 'acc-2',
                    oldPassword: 'OldPass1',
                    newPassword: 'NewPass1',
                }),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('60秒内重复修改密码应抛出频率限制', async () => {
            (verifyPassword as any).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
            mockCache.exists.mockResolvedValue(true); // 已有频率限制标记

            await expect(
                service.changePassword({
                    accountId: 'acc-1',
                    oldPassword: 'OldPass1',
                    newPassword: 'NewPass1',
                }),
            ).rejects.toThrow(/频繁/);
        });
    });

    // ── bindPhone ──

    describe('bindPhone', () => {
        it('应成功绑定新手机号', async () => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(null);
            mockPrisma.client.accountIdentity.create.mockResolvedValue({
                id: 'identity-1',
                accountId: 'acc-1',
                identityType: 'phone',
                identifier: '13800001234',
            });

            const result = await service.bindPhone({
                accountId: 'acc-1',
                phone: '13800001234',
                code: '123456',
            });

            expect(result.success).toBe(true);
            expect(mockSms.verifyCode).toHaveBeenCalledWith('13800001234', '123456', 'bind_phone');
            expect(mockPrisma.client.accountIdentity.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        accountId: 'acc-1',
                        identityType: 'phone',
                        identifier: '13800001234',
                        verified: true,
                    }),
                }),
            );
        });

        it('手机号已被其他账户绑定应抛出 40003', async () => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({
                id: 'identity-2',
                accountId: 'acc-other', // 不同账户
                identityType: 'phone',
                identifier: '13800001234',
            });

            await expect(
                service.bindPhone({
                    accountId: 'acc-1',
                    phone: '13800001234',
                    code: '123456',
                }),
            ).rejects.toMatchObject({ response: { code: 40003 } });
        });

        it('手机号已绑定当前账户应抛出 40004', async () => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({
                id: 'identity-3',
                accountId: 'acc-1', // 同一账户
                identityType: 'phone',
                identifier: '13800001234',
            });

            await expect(
                service.bindPhone({
                    accountId: 'acc-1',
                    phone: '13800001234',
                    code: '123456',
                }),
            ).rejects.toMatchObject({ response: { code: 40004 } });
        });

        it('验证码错误应抛出 SmsService 异常', async () => {
            mockSms.verifyCode.mockRejectedValueOnce(new BadRequestException({ code: 30005, message: '验证码错误' }));

            await expect(
                service.bindPhone({
                    accountId: 'acc-1',
                    phone: '13800001234',
                    code: '999999',
                }),
            ).rejects.toMatchObject({ response: { code: 30005 } });
        });
    });

    // ── unbindPhone ──

    describe('unbindPhone', () => {
        const phoneIdentity = {
            id: 'phone-identity-1',
            accountId: 'acc-1',
            identityType: 'phone',
            identifier: '13800001234',
        };

        it('应成功解绑手机号（仍有其他登录方式）', async () => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(phoneIdentity);
            mockPrisma.client.accountIdentity.count.mockResolvedValue(1); // 还有 username
            mockPrisma.client.accountIdentity.delete.mockResolvedValue(phoneIdentity);

            const result = await service.unbindPhone({
                accountId: 'acc-1',
                phone: '13800001234',
                code: '123456',
            });

            expect(result.success).toBe(true);
            expect(mockSms.verifyCode).toHaveBeenCalledWith('13800001234', '123456', 'unbind_phone');
            expect(mockPrisma.client.accountIdentity.delete).toHaveBeenCalledWith({
                where: { id: 'phone-identity-1' },
            });
        });

        it('解绑后仅剩一种登录方式应抛出 40005 拒绝', async () => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(phoneIdentity);
            mockPrisma.client.accountIdentity.count.mockResolvedValue(0); // 解绑后无其他方式

            await expect(
                service.unbindPhone({
                    accountId: 'acc-1',
                    phone: '13800001234',
                    code: '123456',
                }),
            ).rejects.toMatchObject({ response: { code: 40005 } });
        });

        it('手机号未绑定当前账户应抛出 40001', async () => {
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(null);

            await expect(
                service.unbindPhone({
                    accountId: 'acc-1',
                    phone: '13800001299',
                    code: '123456',
                }),
            ).rejects.toMatchObject({ response: { code: 40001 } });
        });
    });
});
