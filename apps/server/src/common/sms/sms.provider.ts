/**
 * 短信服务 Provider 接口
 *
 * 设计动机：
 * - 业务层只关心"发送验证码"这一动作，不关心具体通道
 * - 通过接口注入 Provider，运行时根据 system_config.sms.provider.driver 选择实现
 * - 单元测试可注入 mock provider，无需真实通道
 *
 * 现有实现：
 * - MockProvider：开发 / 测试环境，控制台打印
 * - AliyunProvider：生产环境，调用阿里云短信服务
 *
 * 扩展方式：
 * - 实现 SmsProvider 接口，在 SmsModule 的 providers 数组中注册
 * - SmsService.sendVerificationCode 内部按 driver 选择 provider
 */

/** 短信发送结果（统一抽象） */
export interface SmsSendResult {
    /** 是否发送成功 */
    success: boolean;
    /** 渠道返回的请求 ID（用于排查 / 对账） */
    requestId?: string;
    /** 渠道错误码（失败时） */
    errorCode?: string;
    /** 渠道错误信息（失败时） */
    errorMessage?: string;
}

/** 短信渠道标识 */
export type SmsDriver = 'mock' | 'aliyun';

/**
 * 短信 Provider 抽象接口
 * - send 是唯一必须实现的方法
 * - 所有 Provider 实现必须在内部捕获异常并返回 success:false，而不是向上抛
 *   （让 SmsService 统一处理降级 / 错误码映射）
 */
export interface SmsProvider {
    /** Provider 标识，对应 system_config.sms.provider.driver */
    readonly driver: SmsDriver;

    /**
     * 发送短信
     * @param phone 接收方手机号（E.164 或国内 11 位）
     * @param code 验证码（6 位数字字符串）
     * @param signName 短信签名（阿里云模板必须）
     * @param templateCode 模板 ID（阿里云模板必须；mock 可忽略）
     * @returns 发送结果
     */
    send(phone: string, code: string, signName: string, templateCode: string): Promise<SmsSendResult>;
}
