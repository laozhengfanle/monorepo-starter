import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider } from '../sms.provider.js';

/**
 * 默认短信 Provider：仅打日志，不真实发送
 * - 开发 / 测试环境用（无需配置云厂商密钥）
 * - 生产环境替换为真实实现（阿里云 / 腾讯云 SMS SDK）
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';

  private readonly logger = new Logger(MockSmsProvider.name);

  async send(
    phone: string,
    templateCode: string,
    params: Record<string, string>,
  ): Promise<void> {
    this.logger.log(
      `[mock sms] phone=${phone} template=${templateCode} params=${JSON.stringify(params)}`,
    );
  }
}
