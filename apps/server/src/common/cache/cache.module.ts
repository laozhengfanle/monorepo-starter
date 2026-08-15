import { Global, Module } from '@nestjs/common';
import { CACHE_SERVICE_TOKEN } from './cache.interface.js';
import { CacheService } from './cache.service.js';

/** 全局缓存模块：以 CACHE_SERVICE_TOKEN 提供 CacheService（Redis / 内存降级） */
@Global()
@Module({
  providers: [{ provide: CACHE_SERVICE_TOKEN, useClass: CacheService }],
  exports: [CACHE_SERVICE_TOKEN],
})
export class CacheModule {}
