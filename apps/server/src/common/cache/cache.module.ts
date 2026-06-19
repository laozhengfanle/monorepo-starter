import { Global, Module } from '@nestjs/common';
import { CACHE_SERVICE_TOKEN } from './cache.interface.js';
import { CacheService } from './cache.service.js';

/**
 * 缓存全局模块
 * - 有 REDIS_URL 用 ioredis 创建连接
 * - 无 REDIS_URL 降级为内存缓存（本地开发可选）
 * - @Global() 声明后，其他模块无需重复 imports 即可注入
 */
@Global()
@Module({
    providers: [
        {
            provide: CACHE_SERVICE_TOKEN,
            useClass: CacheService,
        },
    ],
    exports: [CACHE_SERVICE_TOKEN],
})
export class CacheModule {}
