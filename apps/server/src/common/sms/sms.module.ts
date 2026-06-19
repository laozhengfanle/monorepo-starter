/**
 * 短信模块（验证码通道）
 *
 * 组成：
 * - SmsService：业务核心（频率限制 / Redis 存储 / Provider 调用 / 审计）
 * - MockSmsProvider：开发 / 测试环境的默认 Provider
 * - AliyunSmsProvider：生产环境 Provider（骨架，待真实接入）
 *
 * 模块设计：
 * - @Global() 让全应用（任何模块）都可直接注入 SmsService
 * - AuthModule、MemberAuthController 等都不需要在 imports 显式声明
 *
 * 配置入口：
 * - system_config.sms.provider.value.driver = 'mock' | 'aliyun'
 * - 切换 driver 后 SmsService 在运行时自动选择对应 Provider
 */
import { Global, Module } from '@nestjs/common';
import { SmsService } from './sms.service.js';
import { MockSmsProvider } from './providers/mock.provider.js';
import { AliyunSmsProvider } from './providers/aliyun.provider.js';
import { SystemConfigModule } from '../../modules/admin/system-config/system-config.module.js';
import { AuditModule } from '../../modules/audit/audit.module.js';

@Global()
@Module({
    imports: [
        /** SystemConfigModule 导出 SystemConfigService（system_config 表读配置） */
        SystemConfigModule,
        /** AuditModule 全局模块，提供 AuditService（写 verification_code 审计） */
        AuditModule,
    ],
    providers: [SmsService, MockSmsProvider, AliyunSmsProvider],
    exports: [SmsService],
})
export class SmsModule {}
