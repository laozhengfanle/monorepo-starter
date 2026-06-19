/* eslint-disable */
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 配置文件（Prisma 7 新增）
 * - 显式加载 .env 文件，确保 DATABASE_URL 可用
 * - 使用 process.env 而非 env() 函数（更可靠）
 */
config();

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'tsx prisma/seed.ts',
    },
    datasource: {
        url: process.env['DATABASE_URL']!,
    },
});
