import { Injectable, Logger } from '@nestjs/common';
import type { EmailProvider } from '../email.provider.js';

/**
 * 默认邮件 Provider：仅打日志，不真实发送
 * - 开发 / 测试环境用（无需配置 SMTP）
 * - 生产环境替换为真实实现（nodemailer 等）
 */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';

  private readonly logger = new Logger(MockEmailProvider.name);

  async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<void> {
    this.logger.log(
      `[mock email] to=${to} subject=${subject} htmlLen=${html.length} textLen=${text?.length ?? 0}`,
    );
  }
}
