import crypto from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';

/**
 * Pino 日志配置工厂
 *
 * 设计要点：
 * - dev：human-readable（pino-pretty）+ 颜色 + 单行 + level=debug
 * - prod：JSON 格式 + level=info + 字段脱敏（防止敏感信息泄漏到日志聚合系统）
 * - 通用：每个请求生成 UUID 作为 requestId，并注入到自定义字段
 *
 * 脱敏策略：
 * - 严格全字段 redact（如 `*.password`），而不是部分打码
 * - 原因：subagent / 业务代码不掌握具体格式，简单粗暴更安全
 * - 同时 dev 环境也启用脱敏路径（开发日志不应暴露密码）
 */

/**
 * 通用脱敏路径：覆盖请求头 + 请求体 + 响应体中的敏感字段
 *
 * 设计原则：
 * - 用「通配前缀」覆盖所有可能出现敏感字段的层级（`*.password` 覆盖 req.body.password / res.body.password / user.password 等）
 * - 严格全字段 redact（不部分打码）—— 简单粗暴更安全
 * - 持续扩展：每加一种敏感字段就追加一项
 */
export const REDACT_PATHS: string[] = [
    // ── HTTP 请求头 ──
    'req.headers.authorization',
    'req.headers.cookie',
    // ── 通用敏感字段（任一层级） ──
    '*.password',
    '*.token',
    '*.newPassword',
    '*.confirmPassword',
    '*.oldPassword',
    // 第三方平台密钥（OSS / Stripe / 微信 / 支付宝 等）
    '*.accessKey',
    '*.secretKey',
    '*.apiKey',
    // 一次性验证码（短信、邮箱、TOTP）
    '*.smsCode',
    '*.otpCode',
    // 鉴权 token（jwt / csrf / session）
    '*.jwt',
    '*.csrfToken',
    '*.sessionToken',
    // ── 响应体中的鉴权字段 ──
    'res.body.accessToken',
    'res.body.refreshToken',
    // ── 请求体中的 PII ──
    'req.body.phone',
    'req.body.email',
    // 部分老接口把短信验证码直接放在 body.sms（而非 body.smsCode），单独兜底
    'req.body.sms',
];

/** 脱敏占位符 */
const REDACT_CENSOR = '[REDACTED]';

/**
 * 根据运行环境返回对应的 Pino 配置
 *
 * @param env - 当前运行环境：dev（开发） / prod（生产）
 * @returns nestjs-pino 的 Params 配置
 */
export function getPinoConfig(env: 'dev' | 'prod'): Params {
    // 通用配置：requestId + userId 注入
    const commonPinoHttp: PinoHttpOptions = {
        // 用 crypto.randomUUID() 给每个请求生成唯一 ID
        // 写入 req.id 后，业务代码可通过 req.log / logger.fields.requestId 关联日志
        genReqId: (req, res) => {
            const id = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
            // 同时回写到响应头，方便前端/客户端定位问题
            res.setHeader('X-Request-ID', id);
            return id;
        },
        // 自定义字段：每条日志都会带上 requestId + userId
        customProps: (req) => {
            // req 经过 genReqId 后一定存在 id 字段
            // user 由 JwtAuthGuard 在请求进入前注入到 req.user
            const user = (req as { user?: { id?: string } }).user;
            return {
                requestId: (req as { id?: string }).id,
                userId: user?.id,
            };
        },
    };

    if (env === 'dev') {
        return {
            pinoHttp: {
                ...commonPinoHttp,
                level: 'debug',
                // dev 用 pino-pretty 走 transport：单行 + 颜色 + 可读时间戳
                transport: {
                    target: 'pino-pretty',
                    options: {
                        singleLine: true,
                        colorize: true,
                        translateTime: 'HH:MM:ss.l',
                        ignore: 'pid,hostname',
                    },
                },
                // dev 也启用脱敏（开发日志不应暴露密码）
                redact: {
                    paths: REDACT_PATHS,
                    censor: REDACT_CENSOR,
                },
            },
        };
    }

    // prod：JSON 输出，便于日志聚合系统（ELK / Loki / Datadog）解析
    return {
        pinoHttp: {
            ...commonPinoHttp,
            level: 'info',
            // 不设置 transport → 默认输出 JSON 到 stdout
            redact: {
                paths: REDACT_PATHS,
                censor: REDACT_CENSOR,
            },
        },
    };
}
