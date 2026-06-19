/**
 * Prisma Client 工厂 — 仅供非 NestJS 场景使用（如 CLI 脚本、seed）
 *
 * NestJS 应用内请注入 PrismaService，通过 .client 属性访问带 Extensions 的客户端。
 * 此文件导出的 prisma 不含 NestJS 生命周期管理，不适合在应用中使用。
 */
import { PrismaClient } from '../../../prisma/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { autoIdExtension, createSoftDeleteExtension } from './prisma-extensions.js';

const pool = new pg.Pool({
    connectionString: process.env['DATABASE_URL'],
});
const adapter = new PrismaPg(pool);
const baseClient = new PrismaClient({ adapter });

const withAutoId = baseClient.$extends(autoIdExtension);
const prisma = withAutoId.$extends(createSoftDeleteExtension(withAutoId));

export type ExtendedPrismaClient = typeof prisma;

/**
 * 事务内 PrismaClient 类型
 * - 用于 $transaction 回调以及接受事务 client 的 helper 函数
 * - 不包含连接/生命周期相关方法
 */
export type PrismaTx = Omit<ExtendedPrismaClient, '$connect' | '$disconnect' | '$on' | '$extends' | '$transaction'>;

export { prisma };
