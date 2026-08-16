/**
 * 短信发送 Provider 抽象接口
 *
 * 设计动机：
 * - 业务层不直接对接阿里云 / 腾讯云 / 华为云短信 API
 * - 每种 Provider 实现自己的发送流程（签名、模板、鉴权）
 * - NotificationService 在运行时按配置选择实现
 *
 * 扩展方式：实现 SmsProvider 接口 → 在 providers/ 下新建文件 → 注册到 notifications.module.ts。
 * 默认 MockSmsProvider：仅打日志，不真实发送（开发环境用）。
 */
export interface SmsProvider {
  /** Provider 名称（用于日志 / 配置选择） */
  readonly name: string;

  /**
   * 发送短信
   * @param phone 手机号（E.164 或国内 11 位）
   * @param templateCode 模板编码（如 SMS_123456）
   * @param params 模板变量（如 { code: '123456' }）
   */
  send(
    phone: string,
    templateCode: string,
    params: Record<string, string>,
  ): Promise<void>;
}
