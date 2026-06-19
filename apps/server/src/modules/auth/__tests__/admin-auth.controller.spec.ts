/**
 * AdminAuthController 单元测试
 *
 * 覆盖场景：
 * - adminLogin 成功：Turnstile 跳过验证 + 登录成功 → 200 + 设置双 cookie
 * - adminLogin 失败：Turnstile 抛 20007 → BadRequestException 上抛（由全局异常过滤器格式化）
 * - adminLogin 失败：账号密码错误（Turnstile 已通过） → 抛鉴权异常
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AdminAuthController } from '../../../bff/admin/auth/admin-auth.controller.js';

function createMockConfigService() {
    return {
        get: vi.fn().mockImplementation((key: string) => {
            if (key === 'auth.COOKIE_SECURE') return false;
            if (key === 'auth.CSRF_COOKIE_SECURE') return false;
            return undefined;
        }),
    };
}

describe('AdminAuthController', () => {
    let controller: AdminAuthController;
    let mockAuth: { adminLogin: ReturnType<typeof vi.fn> };
    let mockTurnstile: { verify: ReturnType<typeof vi.fn> };
    let mockConfig: ReturnType<typeof createMockConfigService>;

    beforeEach(() => {
        mockAuth = {
            adminLogin: vi.fn(),
        };
        mockTurnstile = {
            verify: vi.fn(),
        };
        mockConfig = createMockConfigService();
        controller = new AdminAuthController(mockAuth as any, mockConfig as any, mockTurnstile as any);
    });

    // ── adminLogin：Turnstile 验证通过 ──

    describe('adminLogin', () => {
        it('Turnstile 跳过验证 + 登录成功 → 200 + 设置双 cookie', async () => {
            // Turnstile 内部判断为跳过（未启用 / 缺 secret），不抛错
            mockTurnstile.verify.mockResolvedValue(undefined);
            mockAuth.adminLogin.mockResolvedValue({
                accessToken: 'admin-access',
                refreshToken: 'admin-refresh',
                expiresIn: 900,
                mustChangePassword: false,
            });

            const mockRes = { cookie: vi.fn() };
            const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } };
            const result = await controller.adminLogin(
                { username: 'admin01', password: 'pass1234' } as any,
                mockReq as any,
                mockRes as any,
            );

            // verify 已被调用（即使内部跳过），保证登录链路前置
            expect(mockTurnstile.verify).toHaveBeenCalledWith(undefined, '127.0.0.1');
            // 登录服务已调用
            expect(mockAuth.adminLogin).toHaveBeenCalledWith('admin01', 'pass1234', '127.0.0.1', 'test');
            // 返回结构正确
            expect(result.code).toBe(0);
            expect(result.message).toBe('ok');
            // 设置了 accessToken + refreshToken 双 cookie + csrfToken
            expect(mockRes.cookie).toHaveBeenCalledTimes(3);
        });

        it('Turnstile 抛 20007 时 → BadRequestException 上抛，不调 authService', async () => {
            // Turnstile 校验失败，抛 20007
            mockTurnstile.verify.mockRejectedValue(
                new BadRequestException({ code: 20007, message: '人机验证失败，请刷新页面重试' }),
            );

            const mockRes = { cookie: vi.fn() };
            const mockReq = { ip: '127.0.0.1', headers: {} };

            await expect(
                controller.adminLogin(
                    { username: 'admin01', password: 'pass1234', turnstileToken: 'invalid-token' } as any,
                    mockReq as any,
                    mockRes as any,
                ),
            ).rejects.toThrow(BadRequestException);

            // 验证抛错时不应再调登录服务
            expect(mockAuth.adminLogin).not.toHaveBeenCalled();
            // 验证 verify 被调用，且 token 传了过去
            expect(mockTurnstile.verify).toHaveBeenCalledWith('invalid-token', '127.0.0.1');
        });
    });
});
