import { Injectable, Logger } from '@nestjs/common';
import type { OAuthLoginResult, OAuthProvider, OAuthTokenSet, OAuthUserInfo } from '../oauth.provider.js';

/**
 * 微信小程序登录 Provider（mock）
 *
 * 应用场景：
 * - C 端用户在小程序里点"微信登录" → 前端调 wx.login() 拿到 code → 发给后端
 *
 * 当前实现：
 * - mock：基于 code 派生稳定 openid / unionid
 * - 真实接入时按 TODO 注释补全 jscode2session 即可
 */
@Injectable()
export class WechatMiniprogramProvider implements OAuthProvider {
    readonly name = 'wechat-miniprogram' as const;
    private readonly logger = new Logger(WechatMiniprogramProvider.name);

    /**
     * 小程序不走授权 URL（前端用 wx.login 拿 code）
     * - 抛错：业务层不应调用此方法
     */
    getAuthorizationUrl(_state: string, _redirectUri: string): string {
        throw new Error('Wechat miniprogram OAuth does not use authorization URL. Use wx.login() to get code.');
    }

    /**
     * 用 code 换取 session_key + openid
     * - mock：基于 code 派生稳定 openid
     * - 真实：GET https://api.weixin.qq.com/sns/jscode2session?appid=...&secret=...&js_code=${code}&grant_type=authorization_code
     */
    async getUserInfo(code: string): Promise<OAuthLoginResult> {
        this.logger.log(`[WechatMiniprogram mock] getUserInfo code=${code}`);

        /** mock：基于 code 派生稳定 openid */
        const mockOpenId = `mock-wx-mp-${this.hashCode(code)}`;
        const userInfo: OAuthUserInfo = {
            openId: mockOpenId,
            unionId: `mock-wx-mp-union-${this.hashCode(code)}`,
            nickname: '',
            avatar: '',
            raw: { mock: true, code },
        };
        const token: OAuthTokenSet = {
            accessToken: `mock-wx-mp-sk-${Date.now()}`, // 真实场景是 session_key
            expiresIn: 7200,
        };
        return { token, userInfo };
    }

    /**
     * 微信小程序不支持 refresh token
     */
    async refreshAccessToken(_refreshToken: string): Promise<OAuthTokenSet> {
        throw new Error('Wechat miniprogram OAuth does not support refresh_token');
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
