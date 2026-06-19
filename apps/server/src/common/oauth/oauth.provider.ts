/**
 * 第三方登录 Provider 抽象接口
 *
 * 设计动机：
 * - 业务层不直接对接微信 / Apple / Google API
 * - 每种 Provider 实现自己的授权 URL / 换取 code → token / 拉用户信息流程
 * - OAuthService 在运行时按 provider 名称选择实现
 *
 * 三个方法：
 * - getAuthorizationUrl：生成授权跳转 URL（web 用）
 * - getUserInfo：用 code 换 access_token 再拉 userInfo
 * - refreshAccessToken：刷新 token（可选；部分 provider 不支持）
 */

/** OAuth Provider 标识 */
export type OAuthProviderName = 'wechat-web' | 'wechat-miniprogram' | 'apple';

/** OAuth 用户信息（统一抽象） */
export interface OAuthUserInfo {
    /** 提供方内部的唯一用户 ID（微信 openid / Apple sub） */
    openId: string;
    /** 跨多应用的统一 ID（可选，仅微信 unionid 场景） */
    unionId?: string;
    /** 昵称 / 显示名 */
    nickname?: string;
    /** 头像 URL */
    avatar?: string;
    /** 邮箱（部分 provider 可拿） */
    email?: string;
    /** 原始 payload（供调试 / 扩展） */
    raw?: Record<string, unknown>;
}

/** OAuth Token 套件（统一抽象） */
export interface OAuthTokenSet {
    /** 访问令牌 */
    accessToken: string;
    /** 刷新令牌（可选） */
    refreshToken?: string;
    /** 过期时间（秒） */
    expiresIn?: number;
    /** 授权作用域 */
    scope?: string;
}

/** getUserInfo 返回结构 */
export interface OAuthLoginResult {
    token: OAuthTokenSet;
    userInfo: OAuthUserInfo;
}

/**
 * 第三方登录 Provider 抽象接口
 */
export interface OAuthProvider {
    /** Provider 标识（对应 system_config.oauth.providers[xxx]） */
    readonly name: OAuthProviderName;

    /**
     * 构造授权跳转 URL（Web OAuth 用）
     * - 小程序不需要此方法（走 wx.login 拿 code）
     * - 返回的 URL 客户端跳转即可
     *
     * @param state 防 CSRF 随机串（已由 OAuthService 生成）
     * @param redirectUri 回调地址（provider 控制台已配的域名 + 路径）
     */
    getAuthorizationUrl(state: string, redirectUri: string): string;

    /**
     * 用 code 换取 token + 拉用户信息
     * - Web：code 是回调拿到的临时 code
     * - 小程序：code 是 wx.login() 拿到的临时 code（走不同的端点）
     * - Apple：identityToken 走 jose 校验，不调此方法
     */
    getUserInfo(code: string, redirectUri?: string): Promise<OAuthLoginResult>;

    /**
     * 刷新 access token（可选）
     * - 微信不支持 refresh → 抛 NotImplementedError
     * - Apple 不需要 refresh（identityToken 一次性）
     */
    refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet>;
}
