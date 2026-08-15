import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

// 预载 .env，确保 DATABASE_URL 可用（prisma CLI 不会自动加载 .env）
for (const envFile of ['.env', 'apps/server/.env']) {
  try {
    loadEnvFile(envFile);
  } catch {
    // 文件不存在时忽略
  }
}

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
