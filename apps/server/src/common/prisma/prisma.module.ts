import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Prisma 全局模块
 * - @Global() 声明后，其他模块无需重复 imports 即可注入 PrismaService
 * - 导出 PrismaService 供全应用使用
 */
@Global()
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
