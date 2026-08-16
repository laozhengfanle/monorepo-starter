import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER_TOKEN, SMS_PROVIDER_TOKEN } from './tokens.js';
import type { EmailProvider } from './email.provider.js';
import type { SmsProvider } from './sms.provider.js';

/**
 * 通知服务（短信 / 邮件统一出口）
 *
 * 业务层不直接依赖具体 Provider，只注入 NotificationService：
 * - sendSms / sendEmail 方法内部按配置选择 Provider
 * - 配置：NOTIFY_SMS_PROVIDER=mock|aliyun|tencent，NOTIFY_EMAIL_PROVIDER=mock|smtp|ses
 * - 默认 mock（开发环境），生产替换真实实现
 *
 * 当前实现：按配置选择注入的 Provider（多 Provider 时按名字分发）。
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(SMS_PROVIDER_TOKEN) private readonly smsProviders: SmsProvider[],
    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly emailProviders: EmailProvider[],
    private readonly config: ConfigService,
  ) {}

  /** 发送短信（按 NOTIFY_SMS_PROVIDER 选择实现，默认第一个） */
  async sendSms(
    phone: string,
    templateCode: string,
    params: Record<string, string>,
  ): Promise<void> {
    const name = this.config.get<string>('NOTIFY_SMS_PROVIDER', 'mock');
    const provider =
      this.smsProviders.find((p) => p.name === name) ?? this.smsProviders[0];
    if (!provider) {
      this.logger.warn('未配置短信 Provider，跳过发送');
      return;
    }
    await provider.send(phone, templateCode, params);
  }

  /** 发送邮件（按 NOTIFY_EMAIL_PROVIDER 选择实现，默认第一个） */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<void> {
    const name = this.config.get<string>('NOTIFY_EMAIL_PROVIDER', 'mock');
    const provider =
      this.emailProviders.find((p) => p.name === name) ??
      this.emailProviders[0];
    if (!provider) {
      this.logger.warn('未配置邮件 Provider，跳过发送');
      return;
    }
    await provider.send(to, subject, html, text);
  }
}
