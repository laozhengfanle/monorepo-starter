/**
 * 系统配置模块
 * - 注册 SystemConfigService + Resolver
 * - @Global：让 LoginLockService 等基础服务（无业务模块归属）能直接注入
 */
import { Global, Module } from '@nestjs/common';
import { SystemConfigService } from './system-config.service.js';
import { SystemConfigResolver } from './system-config.resolver.js';

@Global()
@Module({
    providers: [SystemConfigService, SystemConfigResolver],
    exports: [SystemConfigService],
})
export class SystemConfigModule {}
