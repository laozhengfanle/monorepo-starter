import { z } from 'zod';

/** 环境变量 schema：启动时由 validateEnv 全量校验，fail-fast */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3301),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
    .default('log'),
  /** 允许跨域访问的 origin，逗号分隔；未配置时默认仅放行 admin 开发地址（3302） */
  CORS_ORIGINS: z
    .string()
    .optional()
    .describe('逗号分隔的允许跨域来源，如 https://admin.example.com,http://localhost:3302'),
  /** PostgreSQL 连接串（Prisma driver adapter 使用） */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 不能为空'),
  /** JWT 签名密钥（认证模块） */
  JWT_SECRET: z.string().min(16, 'JWT_SECRET 至少 16 个字符'),
  /** JWT 过期时间（秒，默认 15 分钟） */
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
});

export type Env = z.infer<typeof EnvSchema>;
