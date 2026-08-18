import type { PrismaClient } from '../../src/generated/prisma-client/client.js';

/**
 * seed 各数据域函数的统一数据库句柄。
 * 每个 seed/ 文件导出一个 `seedXxx(db)` 幂等函数，由入口 seed.ts 按依赖顺序编排。
 */
export type SeedDb = PrismaClient;
