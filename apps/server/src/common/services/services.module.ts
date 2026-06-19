import { Global, Module } from '@nestjs/common';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { RedisDegradationService } from './redis-degradation.service.js';

/**
 * 通用服务模块
 *
 * - @Global() 声明后，AuthModule / AdminModule / 其他业务模块无需重复 imports 即可注入
 * - 当前导出：
 *   - TokenBlacklistService：token 撤销中心
 *   - RedisDegradationService：Redis 降级（safeGet / tryWithFallback）
 *
 * 依赖：
 * - CacheModule（@Global）— 提供 ICacheService
 * - PrismaModule（@Global）— 提供 PrismaService
 * - 自注入：TokenBlacklistService 依赖 RedisDegradationService
 */
@Global()
@Module({
    providers: [TokenBlacklistService, RedisDegradationService],
    exports: [TokenBlacklistService, RedisDegradationService],
})
export class ServicesModule {}
