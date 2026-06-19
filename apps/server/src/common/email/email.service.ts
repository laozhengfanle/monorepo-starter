/**
 * 邮件服务（验证码通道 + 通知通道）
 *
 * 业务职责：
 * - sendVerificationCode：发送验证码（走频率限制 + Redis 存储 + 审计）
 * - sendNotification：发送任意通知（不走限流）
 *
 * 与 SmsService 的差异：
 * - 错误码区间 30101~30199
 * - 多一个 sendNotification 方法（不参与限流）
 * - key 前缀 mono:verify:email:*
 *
 * 配置来源：
 * - system_config.mail.service.value
 *   字段：driver / from.{name,email} / templates / limits.{interval,daily,codeTtl}
 *
 * 错误码：
 * - 30101 发送间隔太短
 * - 30102 每日发送上限
 * - 30104 验证码已过期
 * - 30105 验证码错误
 * - 30109 发送失败
 */
import { randomInt } from 'crypto';
import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CACHE_KEYS } from '../cache/cache-key.constants.js';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';
import { ERROR_CODES } from '../errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemConfigService } from '../../modules/admin/system-config/system-config.service.js';
import { MockEmailProvider } from './providers/mock.provider.js';
import type { EmailPayload, EmailProvider, EmailSendResult } from './email.provider.js';
import type { VerificationCodeCreateInput } from '../../../prisma/generated/models/VerificationCode.js';

/** 验证码默认值（仅在 system_config 完全没配时使用） */
const DEFAULT_CODE_TTL = 1800; // 30 分钟
const DEFAULT_INTERVAL = 60; // 60 秒
const DEFAULT_DAILY = 20;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_MOCK_CODE = '123456';

/** system_config 中 mail.service 的形状（节流相关字段） */
interface MailServiceConfig {
    driver: 'mock' | 'resend';
    from?: { name?: string; email?: string };
    templates?: Record<string, string>;
    limits?: {
        interval?: number;
        daily?: number;
        codeTtl?: number;
        maxAttempts?: number;
    };
}

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);

    constructor(
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly prisma: PrismaService,
        private readonly systemConfigService: SystemConfigService,
        private readonly mockProvider: MockEmailProvider,
    ) {}

    /**
     * 发送验证码
     * - 流程：频率限制 → 选 provider → 生成 code → 存 Redis → 写审计 → 调 provider
     * - 失败：调 provider 返回 success:false → 抛 30109
     */
    async sendVerificationCode(email: string, purpose: string, ip: string): Promise<{ message: string }> {
        const config = await this.loadConfig();
        const interval = config.limits?.interval ?? DEFAULT_INTERVAL;
        const daily = config.limits?.daily ?? DEFAULT_DAILY;
        const codeTtl = config.limits?.codeTtl ?? DEFAULT_CODE_TTL;
        const mockCode = config.templates ? DEFAULT_MOCK_CODE : DEFAULT_MOCK_CODE;
        const driver = config.driver ?? 'mock';
        const template = config.templates?.[purpose] ?? config.templates?.['verify_email'] ?? 'Your code: {{code}}';

        /** Step 1：发送间隔限制 */
        const intervalKey = `${CACHE_KEYS.EMAIL_INTERVAL}:${email}`;
        const intervalExists = await this.cacheService.exists(intervalKey);
        if (intervalExists) {
            throw new BadRequestException({
                code: ERROR_CODES.EMAIL_TOO_FREQUENT,
                message: `发送太频繁，请 ${interval} 秒后重试`,
            });
        }

        /** Step 2：每日发送上限 */
        const dailyKey = `${CACHE_KEYS.EMAIL_DAILY}:${email}`;
        const dailyCount = Number((await this.cacheService.get<string>(dailyKey)) ?? '0');
        if (dailyCount >= daily) {
            throw new BadRequestException({
                code: ERROR_CODES.EMAIL_DAILY_LIMIT,
                message: '今日发送次数已达上限',
            });
        }

        /** Step 3：选 Provider + 生成验证码 */
        const provider: EmailProvider = driver === 'resend' ? this.mockProvider : this.mockProvider;
        const code = driver === 'mock' ? mockCode : String(randomInt(100000, 1000000));

        /** Step 4：写 Redis（验证码 + 间隔标记 + 计数） */
        const codeKey = `${CACHE_KEYS.VERIFY_EMAIL}:${email}`;
        await this.cacheService.setex(codeKey, codeTtl, code);
        await this.cacheService.setex(intervalKey, interval, '1');

        const endOfDay = new Date();
        endOfDay.setHours(24, 0, 0, 0);
        const ttlToMidnight = Math.max(1, Math.floor((endOfDay.getTime() - Date.now()) / 1000));
        await this.cacheService.setex(dailyKey, ttlToMidnight, String(dailyCount + 1));

        /** Step 5：渲染模板（占位符 {{code}} 替换） */
        const html = template.replace(/\{\{code\}\}/g, code);
        const subject = this.subjectFor(purpose);
        const payload: EmailPayload = {
            to: email,
            subject,
            html,
            text: `Your verification code is ${code}`,
        };

        /** Step 6：调 Provider */
        const result: EmailSendResult = await provider.send(payload);

        /** Step 7：写 verification_code 审计 */
        const expiresAt = new Date(Date.now() + codeTtl * 1000);
        await this.prisma.client.verificationCode
            .create({
                data: {
                    identifier: email,
                    code: '******',
                    purpose,
                    channel: 'email',
                    ip,
                    status: result.success ? 'sent' : 'failed',
                    expiresAt,
                } as VerificationCodeCreateInput,
            })
            .catch((err) => {
                this.logger.warn(`[Email] verification_code 审计写入失败: ${(err as Error).message}`);
            });

        if (!result.success) {
            this.logger.warn(
                `[Email] 发送失败 email=${email} purpose=${purpose} errorCode=${result.errorCode} msg=${result.errorMessage}`,
            );
            throw new BadRequestException({
                code: ERROR_CODES.EMAIL_SEND_FAILED,
                message: '邮件发送失败，请稍后重试',
            });
        }

        return { message: '验证码已发送' };
    }

    /**
     * 校验验证码
     * - 成功：删除 Redis key + 更新 verification_code.status='verified'
     * - 失败：attempts 计数 + 1；超 maxAttempts → 状态置 expired
     */
    async verifyCode(email: string, code: string, purpose: string): Promise<void> {
        const codeKey = `${CACHE_KEYS.VERIFY_EMAIL}:${email}`;
        const stored = await this.cacheService.get<string>(codeKey);
        if (!stored) {
            await this.markExpired(email, purpose);
            throw new BadRequestException({
                code: ERROR_CODES.EMAIL_CODE_EXPIRED,
                message: '验证码已过期，请重新获取',
            });
        }

        if (stored !== code) {
            const config = await this.loadConfig();
            const maxAttempts = config.limits?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
            const attemptsKey = `${CACHE_KEYS.EMAIL_ATTEMPTS}:${email}`;
            const attempts = Number((await this.cacheService.get<string>(attemptsKey)) ?? '0') + 1;
            const codeTtl = await this.cacheService.ttl(codeKey);
            const safeTtl = codeTtl > 0 ? codeTtl : 300;
            await this.cacheService.setex(attemptsKey, safeTtl, String(attempts));

            if (attempts >= maxAttempts) {
                await this.cacheService.del(codeKey);
                await this.markExpired(email, purpose);
                throw new BadRequestException({
                    code: ERROR_CODES.EMAIL_CODE_EXPIRED,
                    message: '验证码错误次数过多，请重新获取',
                });
            }

            throw new BadRequestException({
                code: ERROR_CODES.EMAIL_CODE_INVALID,
                message: '验证码错误',
            });
        }

        await this.cacheService.del(codeKey);
        await this.cacheService.del(`${CACHE_KEYS.EMAIL_ATTEMPTS}:${email}`);
        await this.markVerified(email, code, purpose);
    }

    /**
     * 发送任意通知邮件
     * - 不走验证码限流
     * - 不写 verification_code 审计
     * - 调用方负责把 subject / html 写好
     *
     * 适用场景：欢迎邮件 / 密码修改通知 / 订单变更 / 活动通知
     */
    async sendNotification(email: string, subject: string, html: string): Promise<{ success: boolean }> {
        const config = await this.loadConfig();
        const driver = config.driver ?? 'mock';
        const provider: EmailProvider = driver === 'resend' ? this.mockProvider : this.mockProvider;

        const result = await provider.send({ to: email, subject, html });
        if (!result.success) {
            this.logger.warn(`[Email] 通知邮件发送失败: ${email}, ${result.errorMessage}`);
            return { success: false };
        }
        return { success: true };
    }

    /**
     * 读取 mail.service 配置（私有 helper）
     * - 找不到时降级为 mock 模式默认配置
     * - value 是 JSON 字符串，需要 parse
     */
    private async loadConfig(): Promise<MailServiceConfig> {
        const config = (await this.systemConfigService.findByKey('mail.service').catch(() => null)) as {
            value: unknown;
        } | null;
        const raw = config?.value;
        if (raw === null || raw === undefined) return { driver: 'mock' };
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw) as MailServiceConfig;
            } catch {
                return { driver: 'mock' };
            }
        }
        return raw as MailServiceConfig;
    }

    /** 用途 → 邮件主题（简单映射） */
    private subjectFor(purpose: string): string {
        const map: Record<string, string> = {
            verify_email: '邮箱验证',
            reset_password: '重置密码',
            welcome: '欢迎加入',
        };
        return map[purpose] ?? '验证码通知';
    }

    /**
     * 标记最近一条 verification_code 为 verified
     */
    private async markVerified(email: string, _code: string, purpose: string): Promise<void> {
        try {
            const now = new Date();
            const found = await this.prisma.client.verificationCode.findFirst({
                where: { identifier: email, purpose, channel: 'email', status: 'sent' },
                orderBy: { createdAt: 'desc' },
            });
            if (found) {
                await this.prisma.client.verificationCode.update({
                    where: { id: found.id },
                    data: { status: 'verified', verifiedAt: now },
                });
            } else {
                await this.prisma.client.verificationCode.create({
                    data: {
                        identifier: email,
                        code: '******',
                        purpose,
                        channel: 'email',
                        status: 'verified',
                        verifiedAt: now,
                        expiresAt: now,
                    } as VerificationCodeCreateInput,
                });
            }
        } catch (err) {
            this.logger.warn(`[Email] markVerified 失败: ${(err as Error).message}`);
        }
    }

    /**
     * 标记最近一条 verification_code 为 expired（失败次数过多时）
     */
    private async markExpired(email: string, purpose: string): Promise<void> {
        try {
            const found = await this.prisma.client.verificationCode.findFirst({
                where: { identifier: email, purpose, channel: 'email', status: 'sent' },
                orderBy: { createdAt: 'desc' },
            });
            if (found) {
                await this.prisma.client.verificationCode.update({
                    where: { id: found.id },
                    data: { status: 'expired' },
                });
            }
        } catch (err) {
            this.logger.warn(`[Email] markExpired 失败: ${(err as Error).message}`);
        }
    }
}
