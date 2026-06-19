/**
 * OAuthController 单元测试
 *
 * 覆盖场景：
 * - GET /member/auth/wechat-web/authorize-url：配置缺失时 fail-fast
 * - GET /member/auth/wechat-web/authorize-url：配置存在时正常返回 url + state
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OAuthController } from '../oauth.controller.js';

describe('OAuthController', () => {
    let controller: OAuthController;
    let mockOAuthService: any;
    let mockConfigService: any;
    let mockAuditService: any;
    let mockJwtService: any;
    let mockPrisma: any;

    beforeEach(() => {
        /** mock ConfigService：get 接受带命名空间或不带的 key，统一返回 undefined / 注入值 */
        mockConfigService = {
            get: vi.fn().mockImplementation((key: string) => {
                if (key === 'oauth.wechatWebRedirectUri') return undefined;
                return undefined;
            }),
        };
        mockOAuthService = {
            generateState: vi.fn().mockResolvedValue('mock-state-64-chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
            getAuthorizationUrl: vi.fn().mockReturnValue('https://open.weixin.qq.com/connect/oauth2/authorize?xxx'),
            verifyState: vi.fn(),
            fetchUserInfo: vi.fn(),
            findOrCreateByWechat: vi.fn(),
            findOrCreateByApple: vi.fn(),
            verifyAppleIdentityToken: vi.fn(),
            bindOAuth: vi.fn(),
            unbindOAuth: vi.fn(),
        };
        mockAuditService = { record: vi.fn() };
        mockJwtService = { sign: vi.fn() };
        mockPrisma = { client: {} };

        controller = new OAuthController(
            mockOAuthService,
            mockAuditService,
            mockConfigService,
            mockJwtService,
            mockPrisma,
        );
    });

    describe('getWechatWebAuthorizeUrl', () => {
        it('配置 oauth.wechatWebRedirectUri 缺失时应抛 500（fail-fast）', async () => {
            await expect(controller.getWechatWebAuthorizeUrl()).rejects.toMatchObject({
                response: { code: 50000 },
            });
            // 关键断言：未配置时不能 fallback 到相对路径，必须直接抛错
            expect(mockOAuthService.generateState).not.toHaveBeenCalled();
            expect(mockOAuthService.getAuthorizationUrl).not.toHaveBeenCalled();
        });

        it('配置存在时应返回 url + state', async () => {
            mockConfigService.get.mockImplementation((key: string) => {
                if (key === 'oauth.wechatWebRedirectUri') return 'https://example.com/member/auth/callback';
                return undefined;
            });
            const result = await controller.getWechatWebAuthorizeUrl();
            expect(result).toMatchObject({ code: 0, message: 'ok' });
            expect(result.data).toHaveProperty('url');
            expect(result.data).toHaveProperty('state');
            // 验证：redirectUri 已传给 service
            expect(mockOAuthService.generateState).toHaveBeenCalledWith(
                'wechat-web',
                'https://example.com/member/auth/callback',
            );
        });
    });
});
