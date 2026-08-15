import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PublicConfigController } from './public-config.controller.js';
import { SystemConfigController } from './system-config.controller.js';
import { SystemConfigResolver } from './system-config.resolver.js';
import { SystemConfigService } from './system-config.service.js';

/**
 * 系统配置模块（后台设置/存储驱动/Turnstile 等 key-value JSON 配置，GraphQL + REST 双协议）
 * @Global：TurnstileService 等业务服务可直接注入 SystemConfigService
 * （TurnstileModule 不再 import 本模块，避免 AuthModule → TurnstileModule → SystemConfigModule → AuthModule 循环）
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [SystemConfigController, PublicConfigController],
  providers: [SystemConfigService, SystemConfigResolver],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
