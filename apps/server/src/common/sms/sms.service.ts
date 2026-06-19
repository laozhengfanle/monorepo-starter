/**
 * 短信服务（验证码通道）
 *
 * 业务职责：
 * - 生成 6 位随机验证码（mock 模式下使用 system_config 固定值）
 * - 频率限制：发送间隔、每日上限、IP 每小时上限
 * - 验证码下发 → Redis 存储（TTL 由配置决定）→ 阿里云发送
 * - 验证码校验：读 Redis → 一次性消费（成功后删除）
 * - 失败计数：达到 maxAttempts → 状态置 expired
 * - 审计：写入 verification_code 表（channel='sms'）
 *
 * 配置来源：
 * - system_config.sms.provider.value（driver / mockCode / signName / templates / limits）
 * - 通过 SystemConfigService.getConfig('sms.provider') 读取
 *
 * 错误码：
 * - 30001 发送间隔太短
 * - 30002 每日发送上限
 * - 30003 IP 每小时上限
 * - 30004 验证码已过期
 * - 30005 验证码错误
 * - 30009 发送失败可降级
 */
import { randomInt } from 'crypto';
import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CACHE_KEYS } from '../cache/cache-key.constants.js';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';
import { ERROR_CODES } from '../errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemConfigService } from '../../modules/admin/system-config/system-config.service.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { MockSmsProvider } from './providers/mock.provider.js';
import { AliyunSmsProvider } from './providers/aliyun.provider.js';
import type { SmsProvider, SmsSendResult } from './sms.provider.js';
import type { Prisma } from '../../../prisma/generated/client.js';

/** 验证码默认值（仅在 system_config 完全没配时使用） */
const DEFAULT_CODE_TTL = 300; // 5 分钟
const DEFAULT_INTERVAL = 60; // 60 秒
const DEFAULT_DAILY = 10;
const DEFAULT_IP_HOURLY = 20;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_MOCK_CODE = '123456';

/** system_config 中 sms.provider 的形状（节流相关字段） */
interface SmsProviderConfig {
    driver?: 'mock' | 'aliyun';
    mockCode?: string;
    signName?: string;
    templates?: Record<string, string>;
    limits?: {
        interval?: number;
        daily?: number;
        ipHourly?: number;
        codeTtl?: number;
        maxAttempts?: number;
    };
}

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);

    constructor(
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly prisma: PrismaService,
        private readonly systemConfigService: SystemConfigService,
        private readonly auditService: AuditService,
        private readonly mockProvider: MockSmsProvider,
        private readonly aliyunProvider: AliyunSmsProvider,
    ) {}

    /**
     * 发送验证码
     * - 流程：频率限制 → 选 provider → 生成 code → 存 Redis → 写审计 → 调 provider
     * - 失败：调 provider 返回 success:false → 抛 30009（前端可提示"发送失败请重试"）
     *
     * @param phone 接收方手机号
     * @param purpose 用途（login / register / reset_password / bind_phone / verify_email）
     * @param ip 客户端 IP（用于 IP 维度限流）
     * @returns 发送成功标识（mock 模式下可返回 mockCode 便于联调）
     */
    async sendVerificationCode(phone: string, purpose: string, ip: string): Promise<{ message: string }> {
        /** Step 1：读取配置（sms.provider 字段）
         * 注意：SystemConfigService.findByKey 返回的 value 是 JSON 字符串（toSystemConfig 序列化），
         * 需要 JSON.parse 才能拿到 driver/mockCode/limits 等字段。
         */
        const config = (await this.systemConfigService.findByKey('sms.provider').catch(() => null)) as {
            key: string;
            value: unknown;
        } | null;
        const rawValue = config?.value;
        const providerConfig: SmsProviderConfig = (() => {
            if (rawValue === null || rawValue === undefined) return {};
            if (typeof rawValue === 'string') {
                try {
                    return JSON.parse(rawValue) as SmsProviderConfig;
                } catch {
                    return {};
                }
            }
            return rawValue;
        })();

        const interval = providerConfig.limits?.interval ?? DEFAULT_INTERVAL;
        const daily = providerConfig.limits?.daily ?? DEFAULT_DAILY;
        const ipHourly = providerConfig.limits?.ipHourly ?? DEFAULT_IP_HOURLY;
        const codeTtl = providerConfig.limits?.codeTtl ?? DEFAULT_CODE_TTL;
        const mockCode = providerConfig.mockCode ?? DEFAULT_MOCK_CODE;
        const signName = providerConfig.signName ?? 'MonoKit';
        const templates = providerConfig.templates ?? {};
        const templateCode = templates[purpose] ?? templates['login'] ?? 'SMS_DEFAULT';

        /** Step 2：发送间隔限制（60 秒内只能发一次） */
        const intervalKey = `${CACHE_KEYS.SMS_INTERVAL}:${phone}`;
        const intervalExists = await this.cacheService.exists(intervalKey);
        if (intervalExists) {
            throw new BadRequestException({
                code: ERROR_CODES.SMS_TOO_FREQUENT,
                message: `发送太频繁，请 ${interval} 秒后重试`,
            });
        }

        /** Step 3：每日发送上限（按手机号） */
        const dailyKey = `${CACHE_KEYS.SMS_DAILY}:${phone}`;
        const dailyCount = Number((await this.cacheService.get<string>(dailyKey)) ?? '0');
        if (dailyCount >= daily) {
            throw new BadRequestException({
                code: ERROR_CODES.SMS_DAILY_LIMIT,
                message: '今日发送次数已达上限',
            });
        }

        /** Step 4：IP 每小时上限（按 IP） */
        const ipKey = `${CACHE_KEYS.SMS_IP_HOURLY}:${ip}`;
        const ipCount = Number((await this.cacheService.get<string>(ipKey)) ?? '0');
        if (ipCount >= ipHourly) {
            throw new BadRequestException({
                code: ERROR_CODES.SMS_IP_HOURLY_LIMIT,
                message: '当前 IP 发送次数已达上限',
            });
        }

        /** Step 5：选 Provider + 生成验证码 */
        const provider: SmsProvider = providerConfig.driver === 'aliyun' ? this.aliyunProvider : this.mockProvider;
        const code = providerConfig.driver === 'mock' ? mockCode : String(randomInt(100000, 1000000));

        /** Step 6：写 Redis（验证码 + 间隔标记 + 计数） */
        const codeKey = `${CACHE_KEYS.SMS_CODE}:${phone}`;
        await this.cacheService.setex(codeKey, codeTtl, code);
        await this.cacheService.setex(intervalKey, interval, '1');

        /** 当日剩余秒数（用于 daily counter 过期） */
        const endOfDay = new Date();
        endOfDay.setHours(24, 0, 0, 0);
        const ttlToMidnight = Math.max(1, Math.floor((endOfDay.getTime() - Date.now()) / 1000));

        await this.cacheService.setex(dailyKey, ttlToMidnight, String(dailyCount + 1));
        await this.cacheService.setex(ipKey, 3600, String(ipCount + 1));

        /** Step 7：调 Provider */
        const result: SmsSendResult = await provider.send(phone, code, signName, templateCode);

        /** Step 8：写 verification_code 审计（不存明文 code 字段，按 schema 写 '******'） */
        const expiresAt = new Date(Date.now() + codeTtl * 1000);
        await this.prisma.client.verificationCode
            .create({
                data: {
                    identifier: phone,
                    code: '******',
                    purpose,
                    channel: 'sms',
                    ip,
                    status: result.success ? 'sent' : 'failed',
                    expiresAt,
                } as unknown as Prisma.VerificationCodeCreateInput,
            })
            .catch((err) => {
                /** 审计写失败不阻塞主流程（与 AuditService.record 策略一致） */
                this.logger.warn(`[Sms] verification_code 审计写入失败: ${(err as Error).message}`);
            });

        /** Step 9：Provider 失败 → 抛可降级错误码 */
        if (!result.success) {
            this.logger.warn(
                `[Sms] 发送失败 phone=${phone} purpose=${purpose} errorCode=${result.errorCode} msg=${result.errorMessage}`,
            );
            throw new BadRequestException({
                code: ERROR_CODES.SMS_SEND_FAILED,
                message: '短信发送失败，请稍后重试',
            });
        }

        return { message: '验证码已发送' };
    }

    /**
     * 校验验证码
     * - 成功：删除 Redis key + 更新 verification_code.status='verified'
     * - 失败：attempts 计数 + 1；超 maxAttempts → 状态置 expired
     * - 过期（Redis key 缺失）：返回 30004
     * - 错误：返回 30005
     *
     * @param phone 接收方手机号
     * @param code 用户输入的 6 位验证码
     * @param purpose 用途（写入审计时使用）
     */
    async verifyCode(phone: string, code: string, purpose: string): Promise<void> {
        const codeKey = `${CACHE_KEYS.SMS_CODE}:${phone}`;
        const stored = await this.cacheService.get<string>(codeKey);
        if (!stored) {
            /** 标记 expired（找不到最近一条 sent/verified 记录，置 expired） */
            await this.markExpired(phone, purpose);
            throw new BadRequestException({
                code: ERROR_CODES.SMS_CODE_EXPIRED,
                message: '验证码已过期，请重新获取',
            });
        }

        if (stored !== code) {
            /** 失败计数 + 1 */
            const maxAttempts = await this.getMaxAttempts();
            const attemptsKey = `${CACHE_KEYS.SMS_ATTEMPTS}:${phone}`;
            const attempts = Number((await this.cacheService.get<string>(attemptsKey)) ?? '0') + 1;
            const codeTtl = await this.cacheService.ttl(codeKey);
            /** TTL 兜底（memory 模式返回 -1/-2 时给个 5 分钟） */
            const safeTtl = codeTtl > 0 ? codeTtl : 300;
            await this.cacheService.setex(attemptsKey, safeTtl, String(attempts));

            if (attempts >= maxAttempts) {
                /** 达到上限：删验证码 key + 状态置 expired */
                await this.cacheService.del(codeKey);
                await this.markExpired(phone, purpose);
                throw new BadRequestException({
                    code: ERROR_CODES.SMS_CODE_EXPIRED,
                    message: '验证码错误次数过多，请重新获取',
                });
            }

            throw new BadRequestException({
                code: ERROR_CODES.SMS_CODE_INVALID,
                message: '验证码错误',
            });
        }

        /** 校验成功：删 key + 标记 verified */
        await this.cacheService.del(codeKey);
        await this.cacheService.del(`${CACHE_KEYS.SMS_ATTEMPTS}:${phone}`);
        await this.markVerified(phone, code, purpose);
    }

    /**
     * 读取最大失败次数（私有 helper）
     */
    private async getMaxAttempts(): Promise<number> {
        const config = (await this.systemConfigService.findByKey('sms.provider').catch(() => null)) as {
            value: unknown;
        } | null;
        const value = config?.value as SmsProviderConfig | undefined;
        return value?.limits?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    }

    /**
     * 标记最近一条 verification_code 为 verified
     * - 用 updateMany 避免空结果报错
     */
    private async markVerified(phone: string, code: string, purpose: string): Promise<void> {
        try {
            const now = new Date();
            const found = await this.prisma.client.verificationCode.findFirst({
                where: { identifier: phone, purpose, channel: 'sms', status: 'sent' },
                orderBy: { createdAt: 'desc' },
            });
            if (found) {
                await this.prisma.client.verificationCode.update({
                    where: { id: found.id },
                    data: { status: 'verified', verifiedAt: now },
                });
            } else {
                /** 没有最近记录：补一条（保证审计完整） */
                await this.prisma.client.verificationCode.create({
                    data: {
                        identifier: phone,
                        code: '******',
                        purpose,
                        channel: 'sms',
                        status: 'verified',
                        verifiedAt: now,
                        expiresAt: now,
                    } as unknown as Prisma.VerificationCodeCreateInput,
                });
            }
        } catch (err) {
            this.logger.warn(`[Sms] markVerified 失败: ${(err as Error).message}`);
        }
    }

    /**
     * 标记最近一条 verification_code 为 expired（失败次数过多时）
     */
    private async markExpired(phone: string, purpose: string): Promise<void> {
        try {
            const found = await this.prisma.client.verificationCode.findFirst({
                where: { identifier: phone, purpose, channel: 'sms', status: 'sent' },
                orderBy: { createdAt: 'desc' },
            });
            if (found) {
                await this.prisma.client.verificationCode.update({
                    where: { id: found.id },
                    data: { status: 'expired' },
                });
            }
        } catch (err) {
            this.logger.warn(`[Sms] markExpired 失败: ${(err as Error).message}`);
        }
    }
}
