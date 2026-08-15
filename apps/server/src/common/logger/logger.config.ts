import crypto from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';

/**
 * Pino 日志配置工厂（精简版，从 MonoKit 基座迁移）。
 *
 * - dev：pino-pretty 单行 + 颜色 + level 由 LOG_LEVEL 决定（默认 debug）
 * - prod：JSON 输出到 stdout（便于日志聚合），默认 info
 * - 通用：每个请求生成 UUID 作为 requestId，回写 X-Request-ID 响应头
 * - 脱敏：敏感字段全字段 redact（开发环境也启用，不泄露密码/token）
 */

/** Nest LOG_LEVEL 语义 → pino level（log→info, verbose→trace） */
const LOG_LEVEL_TO_PINO: Record<string, string> = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  log: 'info',
  debug: 'debug',
  verbose: 'trace',
};

/** 通用脱敏路径：通配前缀覆盖请求头 + 请求体 + 响应体中的敏感字段 */
export const REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.token',
  '*.newPassword',
  '*.confirmPassword',
  '*.oldPassword',
  '*.accessKey',
  '*.secretKey',
  '*.apiKey',
  '*.smsCode',
  '*.otpCode',
  '*.jwt',
  '*.csrfToken',
  '*.sessionToken',
  'res.body.accessToken',
  'res.body.refreshToken',
  'req.body.phone',
  'req.body.email',
];

const REDACT_CENSOR = '[REDACTED]';

/** 解析 pino level：优先 LOG_LEVEL env（Nest 语义映射），否则按环境给默认值 */
function resolveLevel(env: 'dev' | 'prod'): string {
  const raw = process.env['LOG_LEVEL'];
  if (raw && LOG_LEVEL_TO_PINO[raw]) {
    return LOG_LEVEL_TO_PINO[raw];
  }
  return env === 'dev' ? 'debug' : 'info';
}

export function getPinoConfig(env: 'dev' | 'prod'): Params {
  const commonPinoHttp: PinoHttpOptions = {
    genReqId: (req, res) => {
      const id =
        (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
      res.setHeader('X-Request-ID', id);
      return id;
    },
    customProps: (req) => ({
      requestId: (req as { id?: string }).id,
    }),
  };

  const level = resolveLevel(env);

  if (env === 'dev') {
    return {
      pinoHttp: {
        ...commonPinoHttp,
        level,
        // 注意：webpack 打包 + pino-pretty transport（worker thread）不兼容
        // （thread-stream 的 lib/worker.js 在打包后路径失效），故 dev 也输出 JSON。
        // 需要美化时：node dist/main.js | pnpm exec pino-pretty
        redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
      },
    };
  }

  return {
    pinoHttp: {
      ...commonPinoHttp,
      level,
      redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
    },
  };
}
