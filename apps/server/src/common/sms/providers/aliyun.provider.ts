import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsProvider, SmsSendResult } from '../sms.provider.js';

/**
 * 阿里云短信 Provider（生产环境占位）
 *
 * 依赖：
 * - @alicloud/dysmsapi20170525（SDK）
 * - @alicloud/openapi-core（SDK 内部依赖）
 * - ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET（环境变量或 system_config）
 *
 * 当前实现：返回失败结果（NOT_IMPLEMENTED），让上层 SmsService 走降级路径
 * 真实接入步骤：
 * 1. 准备阿里云短信服务签名 + 模板（控制台申请）
 * 2. 配置环境变量 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET
 * 3. 把 system_config.sms.provider.driver 改为 'aliyun'
 * 4. 调用 @alicloud/dysmsapi20170525 的 sendSms 命令
 * 5. 解析 response.body.code === 'OK' 判定成功
 */
@Injectable()
export class AliyunSmsProvider implements SmsProvider {
    /** Provider 标识（与 system_config.sms.provider.driver 对应） */
    readonly driver = 'aliyun' as const;
    private readonly logger = new Logger(AliyunSmsProvider.name);

    constructor(private readonly configService: ConfigService) {}

    /**
     * 发送短信（阿里云实现 — 当前为占位）
     *
     * @param phone 接收方手机号
     * @param code 验证码
     * @param signName 短信签名（需在阿里云控制台申请）
     * @param templateCode 模板 ID（需在阿里云控制台申请）
     */
    async send(phone: string, code: string, signName: string, templateCode: string): Promise<SmsSendResult> {
        this.logger.warn(
            `[Aliyun SMS] 真实 API 未实现：phone=${phone} signName=${signName} templateCode=${templateCode} code=${code}`,
        );
        return {
            success: false,
            errorCode: 'NOT_IMPLEMENTED',
            errorMessage: '阿里云短信 SDK 未在当前环境接入，请将 driver 切换为 mock 或实现真实 API',
        };
    }
}
