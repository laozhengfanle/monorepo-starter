import { registerAs } from '@nestjs/config';
import { z } from 'zod';

/**
 * 数据库配置 — Zod 校验 fail-fast
 * - url 必填，且必须以 postgresql:// 开头
 * - directUrl 可选（生产环境 PgBouncer 场景）
 * - 注意：Zod 的 .url() 只接受 http/https/ftp 协议，不接受 postgresql://
 *
 * 命名规范：使用小写嵌套 key（database.url / database.directUrl）
 * - 避免直接暴露环境变量名（大写）到业务代码，配置有"领域归属"感
 * - 与 auth.config / redis.config / storage.config 命名风格一致
 */
const databaseSchema = z.object({
    url: z.string().startsWith('postgresql://', 'DATABASE_URL 必须以 postgresql:// 开头'),
    directUrl: z.string().startsWith('postgresql://').optional(),
});

export default registerAs('database', () => {
    return databaseSchema.parse({
        url: process.env['DATABASE_URL'],
        directUrl: process.env['DIRECT_URL'],
    });
});
