import { Global, Module } from '@nestjs/common';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { RedisDegradationService } from './redis-degradation.service.js';
import { LoginLockService } from '../../modules/auth/login-lock.service.js';
import { LoginLockIntegration } from '../../modules/auth/login-lock-integration.js';

/**
 * 通用服务模块
 *
 * - @Global() 声明后，AuthModule / AdminModule / 其他业务模块无需重复 imports 即可注入
 * - 当前导出：
 *   - TokenBlacklistService：token 撤销中心
 *   - RedisDegradationService：Redis 降级（safeGet / tryWithFallback）
 *   - LoginLockService / LoginLockIntegration：登录失败锁定（基础服务，无业务模块归属）
 *
 * 依赖：
 * - CacheModule（@Global）— 提供 ICacheService
 * - PrismaModule（@Global）— 提供 PrismaService
 * - SystemConfigModule（@Global）— LoginLockService 读取 lockDuration / loginFailThreshold
 * - 自注入：TokenBlacklistService 依赖 RedisDegradationService
 */
@Global()
@Module({
    providers: [TokenBlacklistService, RedisDegradationService, LoginLockService, LoginLockIntegration],
    exports: [TokenBlacklistService, RedisDegradationService, LoginLockService, LoginLockIntegration],
})
export class ServicesModule {}
