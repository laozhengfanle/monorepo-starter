import { EnvSchema, type Env } from './env.js';

/**
 * @nestjs/config 的 validate 钩子：启动时校验全部环境变量，
 * 任何缺失/非法配置都会以可读信息 fail-fast，而非运行中静默出错。
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`环境变量校验失败: ${details}`);
  }
  return result.data;
}
