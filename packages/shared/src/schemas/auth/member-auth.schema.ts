import { z } from 'zod';

/**
 * 短信验证码发送 Schema
 * - phone: 中国大陆手机号正则 /^1[3-9]\d{9}$/
 * - purpose: 验证码用途枚举
 * - turnstileToken: Cloudflare Turnstile 一次性 token（可选）
 *   - 可选原因：同 AdminLoginSchema，开发环境 / 关闭 Turnstile 时缺省
 *
 * 支持的用途：
 * - login          → 短信验证码登录
 * - register       → 注册（新手机号）
 * - reset_password → 重置密码
 * - bind_phone     → 换绑手机
 * - verify_email   → 邮箱验证（已存在的邮箱 → 发送短信作为旁路验证）
 *                     注：仅开发环境有此 case，未来 Phase X 接邮件时可改用邮件渠道
 */
export const MemberSmsSendSchema = z
    .object({
        phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式错误'),
        purpose: z.enum(['login', 'register', 'reset_password', 'bind_phone', 'verify_email'], {
            message: '验证码用途无效',
        }),
        turnstileToken: z.string().min(1).optional(),
    })
    .strict();

/** 短信验证码发送输入类型 */
export type MemberSmsSendInput = z.infer<typeof MemberSmsSendSchema>;

/**
 * 短信验证码登录 Schema
 * - phone: 中国大陆手机号
 * - code: 6 位数字验证码
 * - turnstileToken: Cloudflare Turnstile 一次性 token（可选，语义同 MemberSmsSendSchema）
 */
export const MemberSmsLoginSchema = z
    .object({
        phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式错误'),
        code: z.string().regex(/^\d{6}$/, '验证码必须为 6 位数字'),
        turnstileToken: z.string().min(1).optional(),
    })
    .strict();

/** 短信验证码登录输入类型 */
export type MemberSmsLoginInput = z.infer<typeof MemberSmsLoginSchema>;

/**
 * 重置密码 - 发送验证码 Schema
 * - phone: 中国大陆手机号
 * - purpose: 固定为 'reset_password'（用于和登录 / 注册区分）
 * - 实际发送时不校验 purpose（auth.service.sendSmsCode 内部按 purpose 分桶 key），
 *   此处仅做格式约束
 * - turnstileToken: Cloudflare Turnstile 一次性 token（可选）
 *   - 重置密码的短信发送属于"防短信轰炸"重点端点，必须支持
 */
export const ResetPasswordSendSchema = z
    .object({
        phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式错误'),
        purpose: z.enum(['login', 'register', 'reset_password', 'bind_phone', 'verify_email'], {
            message: '验证码用途无效',
        }),
        turnstileToken: z.string().min(1).optional(),
    })
    .strict();

export type ResetPasswordSendInput = z.infer<typeof ResetPasswordSendSchema>;

/**
 * 重置密码 - 提交 Schema
 * - phone: 中国大陆手机号
 * - code: 6 位数字验证码
 * - newPassword: 新密码（≥8 位 + 字母 + 数字）
 *   - 与管理员密码规则一致（安全防护.md Phase 2 要求）
 */
export const ResetPasswordSchema = z
    .object({
        phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式错误'),
        code: z.string().regex(/^\d{6}$/, '验证码必须为 6 位数字'),
        newPassword: z
            .string()
            .min(8, '密码至少 8 位')
            .max(64, '密码最多 64 位')
            .regex(/[A-Za-z]/, '密码必须包含字母')
            .regex(/\d/, '密码必须包含数字'),
    })
    .strict();

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
