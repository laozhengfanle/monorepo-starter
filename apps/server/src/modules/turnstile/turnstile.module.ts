import { Module } from '@nestjs/common';
import { TurnstileService } from './turnstile.service.js';

/** Turnstile 人机验证模块（配置存 system_config.turnstile.config；verify 供登录端点调用）
 * 注：SystemConfigService 由全局 SystemConfigModule 提供，无需显式 import */
@Module({
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class TurnstileModule {}
