/**
 * 邮件服务 Provider 接口
 *
 * 与 sms.provider.ts 同构：
 * - 业务层只关心"发送邮件"和"发送验证码"两类动作
 * - 通过接口注入 Provider，运行时根据 system_config.mail.service.driver 选择
 *
 * 现有实现：
 * - MockEmailProvider：开发 / 测试环境，控制台打印
 * - ResendEmailProvider：生产环境（骨架，留 TODO 注释）
 */

/** 邮件发送结果（统一抽象） */
export interface EmailSendResult {
    /** 是否发送成功 */
    success: boolean;
    /** 渠道返回的 message ID（用于排查 / 对账） */
    messageId?: string;
    /** 渠道错误码（失败时） */
    errorCode?: string;
    /** 渠道错误信息（失败时） */
    errorMessage?: string;
}

/** 邮件渠道标识 */
export type EmailDriver = 'mock' | 'resend';

/** 邮件内容（最小必填） */
export interface EmailPayload {
    /** 收件人邮箱 */
    to: string;
    /** 邮件主题 */
    subject: string;
    /** 邮件正文（HTML） */
    html: string;
    /** 邮件纯文本（可选，部分客户端 fallback） */
    text?: string;
}

/**
 * 邮件 Provider 抽象接口
 * - send 通用发送（用于通知 / 营销 / 任意主题）
 * - sendVerificationCode 走模板（注入 code 进模板）
 * - 真实 Provider（Resend）会把模板编译交给后端，本接口只做抽象
 */
export interface EmailProvider {
    /** Provider 标识（与 system_config.mail.service.driver 对应） */
    readonly driver: EmailDriver;

    /**
     * 发送邮件（通用）
     * - 适用于任意通知 / 营销邮件
     * - 不参与验证码限流（限流由 EmailService 决定）
     */
    send(payload: EmailPayload): Promise<EmailSendResult>;
}
