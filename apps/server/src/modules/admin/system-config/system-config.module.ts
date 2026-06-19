/**
 * 系统配置模块
 * - 注册 SystemConfigService + Resolver
 */
import { Module } from '@nestjs/common';
import { SystemConfigService } from './system-config.service.js';
import { SystemConfigResolver } from './system-config.resolver.js';

@Module({
    providers: [SystemConfigService, SystemConfigResolver],
    exports: [SystemConfigService],
})
export class SystemConfigModule {}
