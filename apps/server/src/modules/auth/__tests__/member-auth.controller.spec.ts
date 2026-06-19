/**
 * MemberAuthController 单元测试
 *
 * 覆盖场景：
 * - sendSmsCode：Turnstile 跳过 → 短信服务调用
 * - sendSmsCode：Turnstile 抛 20007 → BadRequestException 上抛
 * - smsLogin：Turnstile 跳过 + 验证码正确 → 登录成功
 * - smsLogin：Turnstile 抛 20007 → BadRequestException 上抛
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MemberAuthController } from '../member/member-auth.controller.js';

describe('MemberAuthController', () => {
    let controller: MemberAuthController;
    let mockAuth: { memberSmsLogin: ReturnType<typeof vi.fn>; resetPassword: ReturnType<typeof vi.fn> };
    let mockAccount: Record<string, ReturnType<typeof vi.fn>>;
    let mockSms: { sendVerificationCode: ReturnType<typeof vi.fn>; verifyCode: ReturnType<typeof vi.fn> };
    let mockTurnstile: { verify: ReturnType<typeof vi.fn> };
    let mockConfig: { get: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockAuth = {
            memberSmsLogin: vi.fn(),
            resetPassword: vi.fn(),
        };
        mockAccount = {};
        mockSms = {
            sendVerificationCode: vi.fn(),
            verifyCode: vi.fn(),
        };
        mockTurnstile = {
            verify: vi.fn(),
        };
        mockConfig = {
            get: vi.fn().mockImplementation((key: string) => {
                if (key === 'auth.COOKIE_SECURE') return false;
                if (key === 'auth.CSRF_COOKIE_SECURE') return false;
                return undefined;
            }),
        };
        controller = new MemberAuthController(
            mockAuth as any,
            mockAccount as any,
            mockSms as any,
            mockTurnstile as any,
            mockConfig as any,
        );
    });

    // ── sendSmsCode ──

    describe('sendSmsCode', () => {
        it('Turnstile 跳过 + 短信发送成功 → 200', async () => {
            mockTurnstile.verify.mockResolvedValue(undefined);
            mockSms.sendVerificationCode.mockResolvedValue(undefined);

            const mockReq = { ip: '127.0.0.1' };
            const result = await controller.sendSmsCode(
                { phone: '13800138000', purpose: 'login' } as any,
                mockReq as any,
            );

            expect(mockTurnstile.verify).toHaveBeenCalledWith(undefined, '127.0.0.1');
            expect(mockSms.sendVerificationCode).toHaveBeenCalledWith('13800138000', 'login', '127.0.0.1');
            expect(result.code).toBe(0);
        });

        it('Turnstile 抛 20007 时 → BadRequestException 上抛，不调 smsService', async () => {
            mockTurnstile.verify.mockRejectedValue(new BadRequestException({ code: 20007, message: '人机验证失败' }));

            const mockReq = { ip: '127.0.0.1' };
            await expect(
                controller.sendSmsCode(
                    { phone: '13800138000', purpose: 'login', turnstileToken: 'bad' } as any,
                    mockReq as any,
                ),
            ).rejects.toThrow(BadRequestException);

            expect(mockSms.sendVerificationCode).not.toHaveBeenCalled();
            expect(mockTurnstile.verify).toHaveBeenCalledWith('bad', '127.0.0.1');
        });
    });

    // ── smsLogin ──

    describe('smsLogin', () => {
        it('Turnstile 跳过 + 验证码正确 + 登录成功 → 200', async () => {
            mockTurnstile.verify.mockResolvedValue(undefined);
            mockSms.verifyCode.mockResolvedValue(undefined);
            mockAuth.memberSmsLogin.mockResolvedValue({
                accessToken: 'member-access',
                refreshToken: 'member-refresh',
                expiresIn: 900,
                isNewUser: false,
            });

            const mockRes = { cookie: vi.fn() };
            const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } };
            const result = await controller.smsLogin(
                { phone: '13800138000', code: '123456' } as any,
                mockReq as any,
                mockRes as any,
            );

            expect(mockTurnstile.verify).toHaveBeenCalledWith(undefined, '127.0.0.1');
            expect(mockSms.verifyCode).toHaveBeenCalledWith('13800138000', '123456', 'login');
            expect(mockAuth.memberSmsLogin).toHaveBeenCalledWith('13800138000', '127.0.0.1', 'test');
            expect(result.code).toBe(0);
        });

        it('Turnstile 抛 20007 时 → BadRequestException 上抛，不调 sms/verify/login', async () => {
            mockTurnstile.verify.mockRejectedValue(new BadRequestException({ code: 20007, message: '人机验证失败' }));

            const mockRes = { cookie: vi.fn() };
            const mockReq = { ip: '127.0.0.1', headers: {} };
            await expect(
                controller.smsLogin(
                    { phone: '13800138000', code: '123456', turnstileToken: 'bad' } as any,
                    mockReq as any,
                    mockRes as any,
                ),
            ).rejects.toThrow(BadRequestException);

            // 验证抛错时不再继续后续步骤
            expect(mockSms.verifyCode).not.toHaveBeenCalled();
            expect(mockAuth.memberSmsLogin).not.toHaveBeenCalled();
            expect(mockTurnstile.verify).toHaveBeenCalledWith('bad', '127.0.0.1');
        });
    });
});
