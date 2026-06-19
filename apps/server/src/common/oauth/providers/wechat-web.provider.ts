import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthLoginResult, OAuthProvider, OAuthTokenSet, OAuthUserInfo } from '../oauth.provider.js';

/**
 * 微信开放平台 / 公众号 网页扫码登录 Provider（mock）
 *
 * 应用场景：
 * - PC 浏览器扫码登录
 * - H5 公众号 OAuth 授权
 *
 * 当前实现：mock — 派生稳定 openid，不真实调用 https://api.weixin.qq.com
 *
 * 真实接入步骤：
 * 1. 申请微信开放平台账号 → 创建"网站应用" → 拿到 AppID / AppSecret
 * 2. 配置回调域名（公众号 OAuth 还需配置授权回调页面域名）
 * 3. 引导用户访问 getAuthorizationUrl 返回的链接
 * 4. 微信回调时拿 code → 调 getUserInfo 换 access_token + openid
 * 5. 拿到 unionid 需要用户关注过同主体公众号 / 小程序
 */
@Injectable()
export class WechatWebProvider implements OAuthProvider {
    readonly name = 'wechat-web' as const;
    private readonly logger = new Logger(WechatWebProvider.name);

    constructor(private readonly configService: ConfigService) {}

    /**
     * 构造授权 URL
     * - mock：直接返回本地 callback URL 带 state（前端跳转后会被自己拦截做 mock 登录）
     * - 真实接入时改为 https://open.weixin.qq.com/connect/qrconnect
     */
    getAuthorizationUrl(state: string, redirectUri: string): string {
        this.logger.log(`[WechatWeb mock] getAuthorizationUrl state=${state} redirect=${redirectUri}`);
        /** mock 模式：直接返回前端 callback 路径，让前端走本地 mock 流程 */
        return `/mock/oauth/wechat-web/callback?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }

    /**
     * 用 code 换 token + 拉用户信息
     * - mock：基于 code 派生一个稳定 openid（hash）
     * - 真实：先调 oauth2/access_token 换 token，再调 sns/userinfo 拉资料
     */
    async getUserInfo(code: string, _redirectUri?: string): Promise<OAuthLoginResult> {
        // TODO: 真实接入
        // 1. POST https://api.weixin.qq.com/sns/oauth2/access_token?appid=...&secret=...&code=${code}&grant_type=authorization_code
        // 2. POST https://api.weixin.qq.com/sns/userinfo?access_token=...&openid=...&lang=zh_CN

        /** mock：用 code 派生稳定 openid，方便调试 */
        const mockOpenId = `mock-wechat-web-${this.hashCode(code)}`;
        const userInfo: OAuthUserInfo = {
            openId: mockOpenId,
            unionId: `mock-wechat-union-${this.hashCode(code)}`,
            nickname: `微信用户${mockOpenId.slice(-4)}`,
            avatar: '',
            raw: { mock: true, code },
        };
        const token: OAuthTokenSet = {
            accessToken: `mock-wx-at-${Date.now()}`,
            refreshToken: `mock-wx-rt-${Date.now()}`,
            expiresIn: 7200,
        };
        return { token, userInfo };
    }

    /**
     * 刷新 token（微信不支持 refresh_token，抛错）
     */
    async refreshAccessToken(_refreshToken: string): Promise<OAuthTokenSet> {
        throw new Error('Wechat web OAuth does not support refresh_token');
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
