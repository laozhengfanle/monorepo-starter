import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Prisma 客户端是 .js 形式（编译产物由 compile-prisma-client.mjs 同位置生成）
import { PrismaClient } from '../../../prisma/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { autoIdExtension, createSoftDeleteExtension } from './prisma-extensions.js';
import type { ExtendedPrismaClient } from './prisma.js';

/**
 * PrismaService — 数据库连接管理（组合模式）
 *
 * - 不再继承 PrismaClient，改为组合模式
 * - 构造时创建带 Extensions 的客户端：UUID v7 自动注入 + 软删除
 * - 通过 .client 属性暴露扩展后的 PrismaClient（类型安全）
 * - 通过 .rawClient 属性暴露仅带 UUID v7 自动注入的客户端（无软删除拦截）
 *   - 用于「彻底删除」等需要绕过软删除扩展的场景
 * - 健康检查通过 .$queryRaw 访问原始查询能力
 * - onModuleDestroy 同时关闭 Prisma 连接和 pg.Pool（防止连接泄漏）
 *
 * 为什么不用继承：
 * - Prisma 7 的 $extends 返回新类型，无法赋值给 this
 * - 组合模式让 Extensions 成为 Service 的一部分，确保业务代码注入时一定带 Extensions
 *
 * 配置来源：
 * - 通过 ConfigService 注入配置（databaseConfig 已 Zod 校验）
 * - 不再直接读 process.env，避免与 ConfigModule.envFilePath 加载时序耦合
 */

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);
    /** pg.Pool 连接池 — 需要在 onModuleDestroy 中显式关闭，Prisma $disconnect 不会关它 */
    private readonly pool: pg.Pool;
    /** 带 Extensions 的 PrismaClient（业务代码统一使用此属性） */
    private readonly _client: ExtendedPrismaClient;
    /**
     * 仅带 UUID v7 自动注入的 PrismaClient（无软删除拦截）
     * - 暴露给「彻底删除」等需要绕过软删除扩展的场景
     * - 软删除扩展会把 deleted_at: null 自动加到 findUnique/findFirst/findMany 的 where，
     *   并把 delete 改写成 set deletedAt = now()，导致无法真正删除带 deleted_at 字段的表行
     * - rawClient 跳过软删除扩展，find* 不会自动加 deleted_at: null，delete 也不会被改写
     */
    private readonly _rawClient: ExtendedPrismaClient;

    constructor(configService: ConfigService) {
        /**
         * 从 ConfigService 读取 database.url（Zod 校验后一定有值）
         * - ConfigModule.forRoot() 在 AppModule imports 阶段同步执行（@nestjs/config 内部
         *   用 dotenv 加载 .env 到 process.env，再做 Zod 校验）
         * - 所以 PrismaService 实例化时 ConfigService 已就绪，database.url 一定可用
         */
        const databaseUrl = configService.getOrThrow<string>('database.url');
        this.pool = new pg.Pool({
            connectionString: databaseUrl,
        });
        const adapter = new PrismaPg(this.pool);
        const baseClient = new PrismaClient({ adapter });

        /** 第 1 层 Extension：UUID v7 自动注入 */
        const withAutoId = baseClient.$extends(autoIdExtension);

        /** 第 2 层 Extension：软删除（需要引用已扩展的 client 来调用 update） */
        const withSoftDelete = withAutoId.$extends(createSoftDeleteExtension(withAutoId));

        this._client = withSoftDelete;
        this._rawClient = withAutoId;
    }

    /** 获取带 Extensions 的 PrismaClient（类型安全，业务代码统一使用此属性） */
    get client(): ExtendedPrismaClient {
        return this._client;
    }

    /**
     * 获取仅带 UUID v7 自动注入的 PrismaClient（无软删除拦截）
     * - 用途：彻底删除（hard delete）、查找已软删记录
     * - 注意：业务代码默认应该用 .client，仅在需要绕过软删除时才用 .rawClient
     */
    get rawClient(): ExtendedPrismaClient {
        return this._rawClient;
    }

    async onModuleInit() {
        await this._client.$connect();
        this.logger.log('Prisma client connected');
    }

    async onModuleDestroy() {
        await this._client.$disconnect();
        /** 显式关闭 pg.Pool，防止进程退出时连接泄漏 */
        await this.pool.end();
        this.logger.log('Prisma client disconnected');
    }
}
