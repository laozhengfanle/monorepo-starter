/**
 * Turnstile 人机验证模块
 *
 * 提供 TurnstileService 给 AuthModule 的 Controller 注入使用：
 * - AdminAuthController.adminLogin → 防暴力破解
 * - MemberAuthController.sendSmsCode → 防短信轰炸
 * - MemberAuthController.sendResetPasswordCode → 防密码重置滥用
 *
 * 不在 Controller 内部直接做 Cloudflare API 调用，便于：
 * - 单测 mock 替换
 * - 后续切换其他验证码服务（如阿里云滑块、极验等）只需替换 Service
 */
import { Module } from '@nestjs/common';
import { TurnstileService } from './turnstile.service.js';
import { SystemConfigModule } from '../admin/system-config/system-config.module.js';

@Module({
    imports: [
        /**
         * 引入 SystemConfigModule 以注入 SystemConfigService
         * - verify() 优先从 system_config 表读 turnstile.config
         * - 降级再读 TURNSTILE_SECRET_KEY 环境变量
         */
        SystemConfigModule,
    ],
    providers: [TurnstileService],
    exports: [TurnstileService],
})
export class TurnstileModule {}
