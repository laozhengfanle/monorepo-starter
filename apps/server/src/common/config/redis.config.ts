import { registerAs } from '@nestjs/config';
import { z } from 'zod';

/**
 * Redis 配置 — Zod 校验 fail-fast
 * - REDIS_URL 可选：有值时使用 Redis，无值时降级为内存缓存
 * - 格式必须以 redis:// 或 rediss:// 开头
 * - 与 CacheService 的降级逻辑一致：有 URL → Redis，无 URL → 内存
 */
const redisSchema = z.object({
    REDIS_URL: z
        .string()
        .startsWith('redis', 'REDIS_URL 必须以 redis:// 或 rediss:// 开头')
        .optional()
        .or(z.literal('')),
});

export default registerAs('redis', () => {
    return redisSchema.parse(process.env);
});
