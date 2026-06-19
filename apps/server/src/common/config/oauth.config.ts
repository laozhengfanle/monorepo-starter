/**
 * 第三方登录配置 — Zod 校验 fail-fast
 *
 * - OAUTH_WECHAT_WEB_REDIRECT_URI：微信 web OAuth 回调地址（公网可访问的绝对 URL）
 *   - 未配置时 controller 启动后会因 getConfig 返回 undefined 抛 500，fail-fast 提示
 * - OAUTH_ALLOWED_REDIRECT_DOMAINS：redirectUri 域名白名单（逗号分隔）
 *   - 未配置时 OAuthService.validateRedirectUri fallback 到 ['localhost']
 *   - 生产环境必须显式配置，防止攻击者篡改 redirectUri 将 code 劫持到第三方域名
 * - OAUTH_WECHAT_APP_ID / SECRET：Provider 调用凭证（未配时走 mock）
 * - OAUTH_APPLE_CLIENT_ID / TEAM_ID / KEY_ID / PRIVATE_KEY：Apple identity_token 校验
 */
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

/**
 * 校验字符串是合法的 URL（http/https 开头）
 * - 用于校验 OAuth callback 等用户配置的 URL
 * - 失败时返回友好错误信息，避免 Zod 默认报错信息暴露内部细节
 */
const urlString = z
    .string()
    .url('必须是合法 URL（含 http:// 或 https://）')
    .refine((s) => s.startsWith('http://') || s.startsWith('https://'), {
        message: 'URL 必须以 http:// 或 https:// 开头',
    });

const oauthSchema = z.object({
    /** 微信 web OAuth 回调（公网可访问绝对 URL）— 不设默认值，未配时 controller fail-fast */
    OAUTH_WECHAT_WEB_REDIRECT_URI: urlString.optional(),
    /** 微信 web OAuth 应用凭证 — 未配时 Provider 走 mock */
    OAUTH_WECHAT_APP_ID: z.string().optional(),
    OAUTH_WECHAT_APP_SECRET: z.string().optional(),
    /** Apple OAuth 凭证 — 未配时 Provider 走 mock */
    OAUTH_APPLE_CLIENT_ID: z.string().optional(),
    OAUTH_APPLE_TEAM_ID: z.string().optional(),
    OAUTH_APPLE_KEY_ID: z.string().optional(),
    OAUTH_APPLE_PRIVATE_KEY: z.string().optional(),
    /** redirectUri 域名白名单（逗号分隔）— 未配时 OAuthService fallback 到 ['localhost'] */
    OAUTH_ALLOWED_REDIRECT_DOMAINS: z.string().optional(),
});

export default registerAs('oauth', () => {
    return oauthSchema.parse(process.env);
});
