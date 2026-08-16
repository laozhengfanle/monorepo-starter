import { Module } from '@nestjs/common';
import { MockEmailProvider } from './providers/mock-email.provider.js';
import { MockSmsProvider } from './providers/mock-sms.provider.js';
import { EMAIL_PROVIDER_TOKEN, SMS_PROVIDER_TOKEN } from './tokens.js';
import { NotificationService } from './notification.service.js';

/**
 * 通知模块（短信 / 邮件，可插拔 Provider）
 *
 * 当前注册默认 mock Provider（开发环境不真实发送）。
 * 接入真实服务商时：
 *   1. 实现 SmsProvider / EmailProvider 接口
 *   2. 在 providers/ 下新建文件
 *   3. 在下方 providers 数组注册（保持多 Provider 数组注入）
 *   4. 配置 NOTIFY_SMS_PROVIDER / NOTIFY_EMAIL_PROVIDER 环境变量选择
 *
 * 注入方式：Provider 集合以数组形式通过 useFactory 注入，
 * NotificationService 按环境变量选择具体实现（默认第一个）。
 */
@Module({
  providers: [
    // 短信 Provider 集合（useFactory 组装数组，运行时分发）
    {
      provide: SMS_PROVIDER_TOKEN,
      useFactory: (): MockSmsProvider[] => [new MockSmsProvider()],
    },
    // 邮件 Provider 集合
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: (): MockEmailProvider[] => [new MockEmailProvider()],
    },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
