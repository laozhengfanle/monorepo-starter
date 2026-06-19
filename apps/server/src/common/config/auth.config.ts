import { registerAs } from '@nestjs/config';
import { z } from 'zod';

/**
 * 把字符串 ("true" / "false") 解析为 boolean 的 Zod helper
 * - process.env.* 在 Node 中永远是 string | undefined
 * - 默认 false：未配置时是 dev 友好状态（HTTP 也能带 cookie）
 */
const boolFromString = z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false);

/**
 * 认证配置 — Zod 校验 fail-fast
 * - JWT_SECRET 至少 64 位（HS256 要求密钥至少 256 bit = 32 字节，64 hex 字符）
 * - JWT_ACCESS_TTL 默认 900 秒（15 分钟）
 * - JWT_REFRESH_TTL 默认 604800 秒（7 天）
 * - JWT_ISSUER / JWT_AUDIENCE 防跨应用 token 重用
 * - THROTTLE_LOGIN_TTL 登录限流窗口（秒），默认 900（15 分钟）
 * - THROTTLE_LOGIN_LIMIT 窗口内最大失败次数，默认 5
 * - THROTTLE_IP_LIMIT IP 级别限流阈值，默认 50
 * - COOKIE_SECURE accessToken / refreshToken cookie 的 Secure 标志
 *   - dev: false（HTTP 也能带，方便本地调试）
 *   - prod: true（强制 HTTPS 防泄漏）
 * - CSRF_COOKIE_SECURE csrf-token cookie 的 Secure 标志
 *   - 与 COOKIE_SECURE 同样语义，独立配置便于灵活调整
 *   - 使用 __Host- 前缀时必须为 true（浏览器对 __Host- cookie 强制 HTTPS）
 */
/**
 * 生产环境占位密钥的黑名单 — dev 可以，prod 不行
 * 在 authSchema.refine() 中校验，防止 .env.example 里的占位值被遗忘到生产环境
 */
const PLACEHOLDER_JWT_SUBSTRING = 'do-not-use-in-production';
const PLACEHOLDER_AES_KEY = '0000000000000000000000000000000000000000000000000000000000000000';
const isProd = () => process.env.NODE_ENV === 'production';

const authSchema = z
    .object({
        JWT_SECRET: z.string().min(64, 'JWT_SECRET 至少 64 位'),
        JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
        JWT_REFRESH_TTL: z.coerce.number().int().positive().default(604800),
        JWT_ISSUER: z.string().default('monorepo-server'),
        JWT_AUDIENCE: z.string().default('monorepo-app'),
        THROTTLE_LOGIN_TTL: z.coerce.number().int().positive().default(900),
        THROTTLE_LOGIN_LIMIT: z.coerce.number().int().positive().default(5),
        THROTTLE_IP_LIMIT: z.coerce.number().int().positive().default(50),
        COOKIE_SECURE: boolFromString,
        CSRF_COOKIE_SECURE: boolFromString,
        AES_ENCRYPTION_KEY: z.string().length(64, 'AES_ENCRYPTION_KEY 必须为 64 位 hex 字符串'),
        /**
         * bcrypt rounds（密码哈希成本因子）
         * - 范围 10-15：10 ≈ 100ms，12 ≈ 300ms，15 ≈ 3s
         * - 默认 12：OWASP 2024 推荐值，安全性与性能的平衡点
         * - 生产环境若 CPU 充足可调高到 13-14，登录并发高时保持 12
         */
        BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    })
    .refine((d) => !isProd() || !d.JWT_SECRET.includes(PLACEHOLDER_JWT_SUBSTRING), {
        message: 'JWT_SECRET 在生产环境不能使用 .env.example 占位密钥，请用 openssl rand -hex 32 生成',
        path: ['JWT_SECRET'],
    })
    .refine((d) => !isProd() || d.AES_ENCRYPTION_KEY !== PLACEHOLDER_AES_KEY, {
        message: 'AES_ENCRYPTION_KEY 在生产环境不能使用全零占位密钥，请用 openssl rand -hex 32 生成',
        path: ['AES_ENCRYPTION_KEY'],
    });

export default registerAs('auth', () => {
    return authSchema.parse(process.env);
});
