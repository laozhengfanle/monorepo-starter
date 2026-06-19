/**
 * 邮件模块（验证码 + 通知）
 *
 * 组成：
 * - EmailService：业务核心（频率限制 / Redis 存储 / Provider 调用 / 审计）
 * - MockEmailProvider：开发 / 测试环境的默认 Provider
 * - ResendEmailProvider：生产环境 Provider（骨架，留 TODO 注释即可，无需安装 resend）
 *
 * 模块设计：
 * - @Global() 让全应用任何模块都可直接注入 EmailService
 *
 * 配置入口：
 * - system_config.mail.service.value.driver = 'mock' | 'resend'
 */
import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { MockEmailProvider } from './providers/mock.provider.js';
import { SystemConfigModule } from '../../modules/admin/system-config/system-config.module.js';

@Global()
@Module({
    imports: [
        /** SystemConfigModule 导出 SystemConfigService（system_config 表读配置） */
        SystemConfigModule,
    ],
    providers: [EmailService, MockEmailProvider],
    exports: [EmailService],
})
export class EmailModule {}
