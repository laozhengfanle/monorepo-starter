/**
 * 存储服务配置 — Zod 校验 fail-fast
 * - STORAGE_DRIVER: 'local' | 's3'（当前仅 local，后续加 s3）
 * - STORAGE_LOCAL_DIR: 本地存储目录
 * - STORAGE_PUBLIC_BASE_URL: 公开访问 URL 前缀
 */
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const storageSchema = z.object({
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./uploads'),
    STORAGE_PUBLIC_BASE_URL: z.string().default('/uploads'),
});

export default registerAs('storage', () => {
    return storageSchema.parse(process.env);
});
