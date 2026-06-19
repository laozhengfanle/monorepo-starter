/**
 * AuthController 单元测试
 *
 * 覆盖场景：
 * - refresh: 成功刷新 / Cookie缺失报错
 * - logout: 有accountId / accessToken过期fallback到refreshToken / refreshToken无效
 *
 * 拆分说明（Post-Audit Polish Task 4）：
 * - refresh / logout 均由 TokenIssuanceService 处理（已从 AuthService 拆分）
 * - AuthService 不再负责 logout，AuthController 也只注入 TokenIssuanceService
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from '../auth.controller.js';

function createMockConfigService() {
    return {
        get: vi.fn().mockImplementation((key: string) => {
            if (key === 'auth.COOKIE_SECURE') return true;
            return undefined;
        }),
    };
}

describe('AuthController', () => {
    let controller: AuthController;
    let mockTokenIssuance: { refresh: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
    let mockJwt: { verifyAsync: ReturnType<typeof vi.fn> };
    let mockConfig: ReturnType<typeof createMockConfigService>;

    beforeEach(() => {
        mockTokenIssuance = {
            refresh: vi.fn(),
            logout: vi.fn().mockResolvedValue(undefined),
        };
        mockJwt = {
            verifyAsync: vi.fn(),
        };
        mockConfig = createMockConfigService();
        controller = new AuthController(mockTokenIssuance as any, mockJwt as any, mockConfig as any);
    });

    // ── refresh（已迁移到 TokenIssuanceService） ──

    describe('refresh', () => {
        it('成功刷新Token应设置双Cookie并返回成功', async () => {
            mockTokenIssuance.refresh.mockResolvedValue({
                accessToken: 'new-access',
                refreshToken: 'new-refresh',
                expiresIn: 900,
            });
            const mockRes = { cookie: vi.fn() };
            const mockReq = { cookies: { refreshToken: 'old-refresh-token' } };

            const result = await controller.refresh(mockReq as any, mockRes as any);

            expect(result.code).toBe(0);
            expect(result.message).toBe('ok');
            expect(mockRes.cookie).toHaveBeenCalledTimes(2);
            // accessToken cookie
            expect(mockRes.cookie).toHaveBeenCalledWith(
                'accessToken',
                'new-access',
                expect.objectContaining({ httpOnly: true, path: '/' }),
            );
            // refreshToken cookie
            expect(mockRes.cookie).toHaveBeenCalledWith(
                'refreshToken',
                'new-refresh',
                expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
            );
        });

        it('缺少refreshToken时应返回错误码', async () => {
            const mockRes = { cookie: vi.fn(), status: vi.fn() };
            const mockReq = { cookies: {} };

            const result = await controller.refresh(mockReq as any, mockRes as any);

            expect(result.code).toBe(20003);
            expect(result.message).toBe('缺少刷新令牌');
            expect(mockRes.status).toHaveBeenCalledWith(401);
            /** 缺少 token 时不应触发 refresh */
            expect(mockTokenIssuance.refresh).not.toHaveBeenCalled();
        });
    });

    // ── logout（已迁移到 TokenIssuanceService） ──

    describe('logout', () => {
        it('有accessToken解析的accountId时应正常登出', async () => {
            const mockReq = {
                user: { accountId: 'acc-1' },
                cookies: {},
            };
            const mockRes = { clearCookie: vi.fn() };

            const result = await controller.logout(mockReq as any, mockRes as any);

            expect(mockTokenIssuance.logout).toHaveBeenCalledWith('acc-1');
            expect(mockRes.clearCookie).toHaveBeenCalledTimes(2);
            expect(result.code).toBe(0);
        });

        it('accessToken过期时应从refreshToken中提取accountId登出', async () => {
            const mockReq = {
                user: undefined, // access token expired
                cookies: { refreshToken: 'expired-refresh-token' },
            };
            const mockRes = { clearCookie: vi.fn() };
            mockJwt.verifyAsync.mockResolvedValue({ sub: 'acc-2' });

            const result = await controller.logout(mockReq as any, mockRes as any);

            expect(mockJwt.verifyAsync).toHaveBeenCalledWith(
                'expired-refresh-token',
                expect.objectContaining({ ignoreExpiration: true }),
            );
            expect(mockTokenIssuance.logout).toHaveBeenCalledWith('acc-2');
            expect(result.code).toBe(0);
        });

        it('refreshToken无效时应跳过清理Redis（不抛异常）', async () => {
            const mockReq = {
                user: undefined,
                cookies: { refreshToken: 'invalid-token' },
            };
            const mockRes = { clearCookie: vi.fn() };
            mockJwt.verifyAsync.mockRejectedValue(new Error('invalid token'));

            const result = await controller.logout(mockReq as any, mockRes as any);

            // 不应抛异常，应该正常清除 cookie
            expect(mockTokenIssuance.logout).not.toHaveBeenCalled();
            expect(mockRes.clearCookie).toHaveBeenCalledTimes(2);
            expect(result.code).toBe(0);
        });
    });
});
