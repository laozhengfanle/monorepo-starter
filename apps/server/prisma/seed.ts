import { loadEnvFile } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma-client/client.js';
import { seedRoles } from './seed/roles.js';
import { seedMenus } from './seed/menus.js';
import { seedAccounts } from './seed/accounts.js';
import { seedDicts } from './seed/dicts.js';
import { seedConfigs } from './seed/configs.js';
import { seedDemo } from './seed/demo.js';
import { cleanupLegacyMenus } from './seed/cleanup.js';
import type { SeedDb } from './seed/shared.js';

/**
 * Seed 入口（编排层）：只负责环境守卫、数据库连接与各数据域的调用顺序。
 *
 * 文件组织规则（面向生产规模，新增种子数据时按此拆分）：
 * - 按「数据域」分文件：roles / menus / accounts / dicts / configs / demo / cleanup；
 * - 每个文件导出一个 `seedXxx(db)` **幂等**函数（重复执行安全）；
 * - 「运行层级」分离：核心主数据（任何环境都要）与演示数据（demo.ts，仅非生产，
 *   生产裁剪时删除 seedDemo 调用即可）；
 * - 依赖顺序：角色 → 菜单（绑定超管）→ 账户 → 字典 → 配置 → 演示 → 清理。
 */
async function main(): Promise<void> {
  // 生产环境拒绝执行 seed：seed 内置硬编码口令/演示账户，误跑即可能接管生产系统
  const isProduction = process.env['NODE_ENV'] === 'production';
  if (isProduction) {
    throw new Error('生产环境禁止执行 seed，请走正式部署/初始化流程');
  }

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const db: SeedDb = prisma;

  // 依赖顺序：角色 → 菜单（绑定 super_admin）→ 账户 → 字典 → 配置 → 演示（非生产）→ 清理
  const { superAdminId } = await seedRoles(db);
  await seedMenus(db, superAdminId);
  await seedAccounts(db, superAdminId);
  await seedDicts(db);
  await seedConfigs(db);
  if (!isProduction) {
    await seedDemo(db);
  }
  await cleanupLegacyMenus(db);

  await pool.end();
}

for (const envFile of ['.env', 'apps/server/.env']) {
  try {
    loadEnvFile(envFile);
  } catch {
    // 忽略
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
