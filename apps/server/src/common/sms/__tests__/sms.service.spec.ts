/**
 * SmsService 单元测试
 *
 * 覆盖场景：
 * - sendVerificationCode：mock 模式下成功写入 Redis + verification_code 审计
 * - sendVerificationCode：频率限制（60 秒间隔 / 每日上限 / IP 每小时上限）
 * - verifyCode：成功 → 删 Redis + 写 verified
 * - verifyCode：错误 → 计数 + 1；超 maxAttempts → 状态置 expired
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmsService } from '../sms.service.js';
import { MockSmsProvider } from '../providers/mock.provider.js';
import { AliyunSmsProvider } from '../providers/aliyun.provider.js';
import { ERROR_CODES } from '../../errors/error-codes.js';

/** 内存 Mock cache：支持 get / setex / exists / del / ttl */
function createMockCache() {
    const store = new Map<string, { value: unknown; expiresAt?: number }>();
    return {
        get: vi.fn().mockImplementation(async (key: string) => {
            const entry = store.get(key);
            if (!entry) return null;
            if (entry.expiresAt && entry.expiresAt < Date.now()) {
                store.delete(key);
                return null;
            }
            return entry.value;
        }),
        setex: vi.fn().mockImplementation(async (key: string, ttl: number, value: unknown) => {
            store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
        }),
        exists: vi.fn().mockImplementation(async (key: string) => {
            const entry = store.get(key);
            if (!entry) return false;
            if (entry.expiresAt && entry.expiresAt < Date.now()) {
                store.delete(key);
                return false;
            }
            return true;
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
            store.delete(key);
        }),
        ttl: vi.fn().mockImplementation(async (key: string) => {
            const entry = store.get(key);
            if (!entry?.expiresAt) return -1;
            return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
        }),
        get ttlImpl() {
            return store;
        },
    };
}

/** mock system_config 读取（mock provider 模式） */
function createMockSystemConfig() {
    return {
        findByKey: vi.fn().mockImplementation((key: string) => {
            if (key === 'sms.provider') {
                return Promise.resolve({
                    key: 'sms.provider',
                    value: {
                        driver: 'mock',
                        mockCode: '654321',
                        signName: 'TestSign',
                        templates: { login: 'SMS_001' },
                        limits: { interval: 60, daily: 10, ipHourly: 20, codeTtl: 300, maxAttempts: 5 },
                    },
                });
            }
            return Promise.resolve(null);
        }),
    };
}

/** mock Prisma（verificationCode create / findFirst / update） */
function createMockPrisma() {
    const rows: any[] = [];
    return {
        client: {
            verificationCode: {
                create: vi.fn().mockImplementation(async ({ data }: any) => {
                    rows.push({ id: `vc-${rows.length + 1}`, ...data });
                    return rows[rows.length - 1];
                }),
                findFirst: vi.fn().mockImplementation(async () => rows[rows.length - 1] ?? null),
                update: vi.fn().mockImplementation(async ({ where, data }: any) => {
                    const idx = rows.findIndex((r) => r.id === where.id);
                    if (idx >= 0) rows[idx] = { ...rows[idx], ...data };
                    return rows[idx];
                }),
            },
        },
        _rows: rows,
    };
}

/** mock AuditService（不实际写日志） */
function createMockAudit() {
    return { record: vi.fn().mockResolvedValue(undefined) };
}

describe('SmsService', () => {
    let service: SmsService;
    let mockCache: ReturnType<typeof createMockCache>;
    let mockPrisma: ReturnType<typeof createMockPrisma>;
    let mockSystemConfig: ReturnType<typeof createMockSystemConfig>;
    let mockAudit: ReturnType<typeof createMockAudit>;
    let mockProvider: MockSmsProvider;
    let aliyunProvider: AliyunSmsProvider;

    beforeEach(() => {
        mockCache = createMockCache();
        mockPrisma = createMockPrisma();
        mockSystemConfig = createMockSystemConfig();
        mockAudit = createMockAudit();
        mockProvider = new MockSmsProvider();
        aliyunProvider = new AliyunSmsProvider({ get: () => undefined } as any);
        service = new SmsService(
            mockCache as any,
            mockPrisma as any,
            mockSystemConfig as any,
            mockAudit as any,
            mockProvider,
            aliyunProvider,
        );
    });

    // ── sendVerificationCode ──

    describe('sendVerificationCode', () => {
        it('mock 模式下应写入 Redis + verification_code 审计（code 字段不存明文）', async () => {
            const result = await service.sendVerificationCode('13800001234', 'login', '127.0.0.1');

            expect(result.message).toBe('验证码已发送');
            // 验证码写入 Redis
            const codeKey = 'mono:verify:sms:13800001234';
            const stored = await mockCache.get(codeKey);
            expect(stored).toBe('654321'); // mock 模式读 system_config.mockCode
            // 间隔标记
            expect(await mockCache.exists('mono:verify:sms:interval:13800001234')).toBe(true);
            // 审计写入（channel='sms'，code 字段是 '******'）
            expect(mockPrisma.client.verificationCode.create).toHaveBeenCalled();
            const auditData = mockPrisma.client.verificationCode.create.mock.calls[0][0].data;
            expect(auditData.channel).toBe('sms');
            expect(auditData.code).toBe('******');
            expect(auditData.purpose).toBe('login');
            expect(auditData.status).toBe('sent');
        });

        it('发送间隔太短应抛 30001', async () => {
            // 第一次发送
            await service.sendVerificationCode('13800001234', 'login', '127.0.0.1');
            // 第二次发送（60s 内）
            await expect(service.sendVerificationCode('13800001234', 'login', '127.0.0.1')).rejects.toMatchObject({
                response: { code: ERROR_CODES.SMS_TOO_FREQUENT },
            });
        });

        it('每日发送达上限应抛 30002', async () => {
            /** 模拟 10 次已发送（直接 set daily counter = 10） */
            await mockCache.setex('mono:verify:sms:daily:13800001234', 86400, '10');
            await expect(service.sendVerificationCode('13800001234', 'login', '127.0.0.1')).rejects.toMatchObject({
                response: { code: ERROR_CODES.SMS_DAILY_LIMIT },
            });
        });

        it('IP 每小时达上限应抛 30003', async () => {
            await mockCache.setex('mono:verify:sms:ip:1.2.3.4', 3600, '20');
            await expect(service.sendVerificationCode('13800001234', 'login', '1.2.3.4')).rejects.toMatchObject({
                response: { code: ERROR_CODES.SMS_IP_HOURLY_LIMIT },
            });
        });
    });

    // ── verifyCode ──

    describe('verifyCode', () => {
        beforeEach(async () => {
            /** 预置 Redis 中的验证码 */
            await mockCache.setex('mono:verify:sms:13800001234', 300, '654321');
        });

        it('正确验证码应通过（删除 Redis + 写 verified）', async () => {
            /** 预置一条 sent 记录，让 markVerified 走 update 分支 */
            await mockPrisma.client.verificationCode.create({
                data: {
                    identifier: '13800001234',
                    code: '******',
                    purpose: 'login',
                    channel: 'sms',
                    status: 'sent',
                    ip: '127.0.0.1',
                    expiresAt: new Date(Date.now() + 300000),
                },
            });

            await service.verifyCode('13800001234', '654321', 'login');
            // 验证码 key 已删除
            expect(await mockCache.get('mono:verify:sms:13800001234')).toBeNull();
            // verification_code 状态应置 verified
            expect(mockPrisma.client.verificationCode.findFirst).toHaveBeenCalled();
            expect(mockPrisma.client.verificationCode.update).toHaveBeenCalled();
        });

        it('错误验证码应抛 30005 并计数', async () => {
            await expect(service.verifyCode('13800001234', 'wrong-code', 'login')).rejects.toMatchObject({
                response: { code: ERROR_CODES.SMS_CODE_INVALID },
            });
            // attempts 计数 = 1
            const attempts = await mockCache.get('mono:verify:sms:attempts:13800001234');
            expect(attempts).toBe('1');
        });

        it('错误达 maxAttempts 应置 expired（30004）', async () => {
            // 模拟已失败 4 次
            await mockCache.setex('mono:verify:sms:attempts:13800001234', 300, '4');
            // 第 5 次 → 触发上限
            await expect(service.verifyCode('13800001234', 'wrong-code', 'login')).rejects.toMatchObject({
                response: { code: ERROR_CODES.SMS_CODE_EXPIRED },
            });
            // 验证码 key 被删除
            expect(await mockCache.get('mono:verify:sms:13800001234')).toBeNull();
        });

        it('Redis 中不存在验证码应抛 30004（已过期）', async () => {
            await mockCache.del('mono:verify:sms:13800001234');
            await expect(service.verifyCode('13800001234', '654321', 'login')).rejects.toMatchObject({
                response: { code: ERROR_CODES.SMS_CODE_EXPIRED },
            });
        });
    });
});
