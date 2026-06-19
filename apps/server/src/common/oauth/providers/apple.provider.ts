import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyResult } from 'jose';
import { ConfigService } from '@nestjs/config';
import type { OAuthProvider, OAuthTokenSet, OAuthUserInfo } from '../oauth.provider.js';

/**
 * Apple 登录 Provider（mock + 真实 identityToken 校验骨架）
 *
 * Apple 登录特点：
 * - 不需要 authorize URL（前端用 ASAuthorizationAppleIDProvider 拿到 identityToken）
 * - 后端用 jose 校验 identityToken（ES256 签名 + iss/aud/exp 校验）
 * - 解析成功后取 sub 作为唯一用户 ID
 * - 不需要 refresh access token
 *
 * 当前实现：
 * - mock：用代码派生稳定 sub（生产未配置时 fallback）
 * - 真实：jose.createRemoteJWKSet(https://appleid.apple.com/auth/keys) → jwtVerify
 *
 * 真实接入：
 * 1. 申请 Apple Developer 账号 → 创建 Service ID
 * 2. 配置 clientId / teamId / keyId / privateKey（system_config.oauth.providers.apple）
 * 3. 客户端用 ASAuthorizationAppleIDProvider 拿 identityToken
 * 4. 后端 jwtVerify → 解析 sub / email
 */
@Injectable()
export class AppleProvider implements OAuthProvider {
    readonly name = 'apple' as const;
    private readonly logger = new Logger(AppleProvider.name);

    constructor(private readonly configService: ConfigService) {}

    /**
     * Apple 登录不需要 authorize URL（前端用系统 SDK 拿 identityToken）
     * - 抛错：业务层不应调用此方法
     */
    getAuthorizationUrl(_state: string, _redirectUri: string): string {
        throw new Error('Apple Sign In does not use authorization URL. Use ASAuthorizationAppleIDProvider.');
    }

    /**
     * Apple 登录的 getUserInfo 在 OAuthService 走专用 verifyIdentityToken 方法
     * - 此方法仅作为 OAuthProvider 接口兼容
     * - code 实际是 identityToken
     */
    async getUserInfo(code: string): Promise<{ token: OAuthTokenSet; userInfo: OAuthUserInfo }> {
        const verified = await this.verifyIdentityToken(code);
        const userInfo: OAuthUserInfo = {
            openId: verified.payload.sub ?? '',
            email: typeof verified.payload.email === 'string' ? verified.payload.email : undefined,
            raw: { payload: verified.payload },
        };
        return {
            token: { accessToken: code, expiresIn: 3600 },
            userInfo,
        };
    }

    /**
     * Apple 没有 refresh token
     */
    async refreshAccessToken(_refreshToken: string): Promise<OAuthTokenSet> {
        throw new Error('Apple Sign In does not support refresh_token');
    }

    /**
     * 校验 Apple identityToken
     * - 用 jose 拉 Apple 公开 JWKS 验签
     * - 校验 iss / aud / exp
     * - 失败抛 UnauthorizedException（外层 catch 转 40010）
     */
    async verifyIdentityToken(identityToken: string): Promise<JWTVerifyResult> {
        const clientId = this.configService.get<string>('oauth.providers.apple.clientId') ?? '';

        try {
            /** jose 的远程 JWKS 客户端（带缓存） */
            const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
            const result: JWTVerifyResult = await jwtVerify(identityToken, JWKS, {
                issuer: 'https://appleid.apple.com',
                audience: clientId || undefined,
            });
            return result;
        } catch (err) {
            this.logger.warn(`[Apple mock] identityToken 校验失败: ${(err as Error).message}`);
            /**
             * 真实环境失败 → 上抛 BadRequestException（外层 catch 转 40010）
             * mock 模式（clientId 为空）→ 派生假 sub 返回
             */
            if (!clientId) {
                this.logger.log(`[Apple mock] 未配置 clientId，使用 mock 派生 sub`);
                const sub = `mock-apple-${this.hashCode(identityToken)}`;
                const mockPayload: JWTPayload = {
                    sub,
                    iss: 'https://appleid.apple.com',
                    aud: 'mock',
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000),
                };
                return { payload: mockPayload, protectedHeader: { alg: 'mock' } };
            }
            throw err;
        }
    }

    /** 简单的字符串哈希（mock 派生用） */
    private hashCode(s: string): string {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = (h << 5) - h + s.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h).toString(36);
    }
}
