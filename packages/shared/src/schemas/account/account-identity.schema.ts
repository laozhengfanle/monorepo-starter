/**
 * 账号身份认证（Account Identity）相关 Zod Schemas
 *
 * 用途：用户登录后绑定 / 解绑第三方登录方式（手机号、微信、Apple 等）
 *
 * 错误码：
 * - 40001: 验证码无效
 * - 40002: 验证码已过期
 * - 40003: 该第三方账号已绑定其他账号
 * - 40004: 已绑定当前账号
 * - 40005: 至少保留一种登录方式
 * - 40006: 不支持的 provider
 *
 * @module account-identity.schema
 */
import { z } from 'zod';

/**
 * 手机号格式校验（中国大陆 11 位手机号）
 * 注意：仅校验格式，不校验号段真实性（避免误判）
 */
const PhoneSchema = z
    .string()
    .regex(/^1[3-9]\d{9}$/, '手机号格式不正确')
    .describe('手机号（中国大陆 11 位）');

/**
 * 验证码格式：6 位数字
 */
const CodeSchema = z
    .string()
    .regex(/^\d{6}$/, '验证码必须是 6 位数字')
    .describe('6 位数字验证码');

/**
 * 支持的 OAuth provider 列表（与 prisma/seed.ts 的 oauth.providers key 对齐）
 */
export const OAuthProviderEnum = z.enum(['wechat-web', 'wechat-mp', 'wechat-miniprogram', 'apple']);
export type OAuthProvider = z.infer<typeof OAuthProviderEnum>;

/**
 * 绑定手机号 input
 */
export const BindPhoneInputSchema = z.object({
    phone: PhoneSchema,
    code: CodeSchema,
});
export type BindPhoneInput = z.infer<typeof BindPhoneInputSchema>;

/**
 * 解绑手机号 input
 */
export const UnbindPhoneInputSchema = z.object({
    phone: PhoneSchema,
    code: CodeSchema,
});
export type UnbindPhoneInput = z.infer<typeof UnbindPhoneInputSchema>;

/**
 * 绑定 OAuth input
 */
export const BindOAuthInputSchema = z.object({
    provider: OAuthProviderEnum,
    code: z.string().min(1, '授权码不能为空').describe('OAuth 授权码 code'),
    state: z.string().optional().describe('OAuth state（仅 wechat-web 需要）'),
});
export type BindOAuthInput = z.infer<typeof BindOAuthInputSchema>;

/**
 * 解绑 OAuth input
 */
export const UnbindOAuthInputSchema = z.object({
    provider: OAuthProviderEnum,
});
export type UnbindOAuthInput = z.infer<typeof UnbindOAuthInputSchema>;
