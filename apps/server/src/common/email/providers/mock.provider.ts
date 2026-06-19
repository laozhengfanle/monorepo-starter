import { Injectable, Logger } from '@nestjs/common';
import type { EmailPayload, EmailProvider, EmailSendResult } from '../email.provider.js';

/**
 * Mock 邮件 Provider（开发 / 测试环境使用）
 *
 * 行为：
 * - 不真实发送邮件，只把邮件主题 / 正文打印到服务端控制台
 * - 始终返回 success:true
 *
 * 适用场景：
 * - 本地开发（无 Resend 账号）
 * - CI / E2E 测试
 * - seed 后调试
 */
@Injectable()
export class MockEmailProvider implements EmailProvider {
    /** Provider 标识（与 system_config.mail.service.driver 对应） */
    readonly driver = 'mock' as const;
    private readonly logger = new Logger(MockEmailProvider.name);

    /**
     * 发送邮件（mock：只打印到控制台）
     * - 控制台格式：[EMAIL MOCK] to=... subject=...
     * - HTML 内容截断打印（避免日志刷屏）
     */
    async send(payload: EmailPayload): Promise<EmailSendResult> {
        /** 截断 HTML（> 200 字符只取前 200 + ...） */
        const htmlPreview = payload.html.length > 200 ? payload.html.slice(0, 200) + '...' : payload.html;
        this.logger.log(`[EMAIL MOCK] to=${payload.to} subject=${payload.subject} html_len=${payload.html.length}`);
        this.logger.debug(`[EMAIL MOCK] html_preview=${htmlPreview}`);

        return {
            success: true,
            messageId: `mock-email-${Date.now()}`,
        };
    }
}
