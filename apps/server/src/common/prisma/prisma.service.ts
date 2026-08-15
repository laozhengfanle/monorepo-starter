import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma-client/client.js';
import { autoIdExtension, createSoftDeleteExtension } from './prisma-extensions.js';

/** 带扩展的 PrismaClient 类型（UUID v7 + 软删除） */
type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>['client'];

/** 创建带扩展的 PrismaClient + pg 连接池 */
function createExtendedClient(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const baseClient = new PrismaClient({ adapter });

  // 第 1 层：UUID v7 自动注入
  const withAutoId = baseClient.$extends(autoIdExtension);
  // 第 2 层：软删除（引用已扩展的 client 来调用 update）
  const client = withAutoId.$extends(createSoftDeleteExtension(withAutoId));

  return { pool, client, rawClient: withAutoId };
}

/**
 * PrismaService — 数据库连接管理（组合模式）。
 *
 * - 不继承 PrismaClient，改为组合模式（Prisma 7 的 $extends 返回新类型，无法赋值给 this）
 * - .client：业务代码统一使用（含软删除拦截）
 * - .rawClient：仅含 UUID v7 注入，用于「彻底删除」等绕过软删除的场景
 * - onModuleDestroy 同时关闭 Prisma 连接和 pg.Pool（防连接泄漏）
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  private readonly prisma: ExtendedPrismaClient;
  private readonly prismaRaw: ExtendedPrismaClient;

  constructor(configService: ConfigService) {
    const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');
    const built = createExtendedClient(databaseUrl);
    this.pool = built.pool;
    this.prisma = built.client;
    this.prismaRaw = built.rawClient;
  }

  /** 带扩展的 PrismaClient（业务代码统一使用） */
  get client(): ExtendedPrismaClient {
    return this.prisma;
  }

  /** 仅含 UUID v7 注入的客户端（绕过软删除） */
  get rawClient(): ExtendedPrismaClient {
    return this.prismaRaw;
  }

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
    this.logger.log('Prisma client connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
    this.logger.log('Prisma client disconnected');
  }
}
