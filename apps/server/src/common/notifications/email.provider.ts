/**
 * 邮件发送 Provider 抽象接口
 *
 * 设计动机：
 * - 业务层不直接对接 nodemailer / 阿里云邮件推送 / SendGrid API
 * - 每种 Provider 实现自己的发送流程
 * - NotificationService 在运行时按配置选择实现
 *
 * 扩展方式：实现 EmailProvider 接口 → 在 providers/ 下新建文件 → 注册到 notifications.module.ts。
 * 默认 MockEmailProvider：仅打日志，不真实发送（开发环境用）。
 */
export interface EmailProvider {
  /** Provider 名称（用于日志 / 配置选择） */
  readonly name: string;

  /**
   * 发送邮件
   * @param to 收件人
   * @param subject 主题
   * @param html 正文（HTML）
   * @param text 纯文本正文（降级用，可选）
   */
  send(to: string, subject: string, html: string, text?: string): Promise<void>;
}
