import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PublicConfigResolver } from './public-config.resolver.js';
import { SystemConfigResolver } from './system-config.resolver.js';
import { SystemConfigService } from './system-config.service.js';

/**
 * 系统配置模块（后台设置/存储驱动/Turnstile 等 key-value JSON 配置，GraphQL 数据网关（REST 为 BFF 胶水层，非本模块职责））
 * @Global：TurnstileService 等业务服务可直接注入 SystemConfigService
 * （TurnstileModule 不再 import 本模块，避免 AuthModule → TurnstileModule → SystemConfigModule → AuthModule 循环）
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [SystemConfigService, SystemConfigResolver, PublicConfigResolver],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
