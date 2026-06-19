import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider, SmsSendResult } from '../sms.provider.js';

/**
 * Mock 短信 Provider（开发 / 测试环境使用）
 *
 * 行为：
 * - 不真实发送短信，只把验证码打印到服务端控制台
 * - 默认始终返回 success:true（除非代码被改坏）
 *
 * 适用场景：
 * - 本地开发（无阿里云账号）
 * - CI / E2E 测试
 * - seed 后调试
 *
 * 切换到真实环境：在 system_config.sms.provider.value.driver 改为 'aliyun'
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
    /** Provider 标识（与 system_config.sms.provider.driver 对应） */
    readonly driver = 'mock' as const;
    private readonly logger = new Logger(MockSmsProvider.name);

    /**
     * 发送短信（mock：只打印到控制台）
     * - 注意：实际生产环境的 mock 模式应从 system_config.sms.provider.mockCode 读固定验证码
     * - 该 service 内的固定 mock code 由 SmsService 在生成 code 阶段决定，Provider 不管
     */
    async send(phone: string, code: string, _signName: string, _templateCode: string): Promise<SmsSendResult> {
        /** 控制台打印 [SMS MOCK] 标签，便于开发时识别（grep 友好） */
        this.logger.log(`[SMS MOCK] phone=${phone} code=${code}`);

        return {
            success: true,
            requestId: `mock-${Date.now()}`,
        };
    }
}
