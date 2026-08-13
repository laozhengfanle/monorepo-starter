import { z } from 'zod';

/** 环境变量 schema：启动时由 validateEnv 全量校验，fail-fast */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3301),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
    .default('log'),
});

export type Env = z.infer<typeof EnvSchema>;
