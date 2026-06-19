/**
 * EmailService 单元测试
 *
 * 覆盖场景：
 * - sendVerificationCode：mock 模式下成功写入 Redis + verification_code 审计
 * - sendVerificationCode：发送间隔 / 每日上限频率限制
 * - verifyCode：成功 / 错误 / 过期
 * - sendNotification：通知邮件不走限流
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../email.service.js';
import { MockEmailProvider } from '../providers/mock.provider.js';
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
    };
}

/** mock system_config（mail.service） */
function createMockSystemConfig() {
    return {
        findByKey: vi.fn().mockImplementation((key: string) => {
            if (key === 'mail.service') {
                return Promise.resolve({
                    key: 'mail.service',
                    value: {
                        driver: 'mock',
                        templates: { verify_email: '<p>Your code is {{code}}</p>' },
                        limits: { interval: 60, daily: 20, codeTtl: 1800, maxAttempts: 5 },
                    },
                });
            }
            return Promise.resolve(null);
        }),
    };
}

/** mock Prisma */
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

describe('EmailService', () => {
    let service: EmailService;
    let mockCache: ReturnType<typeof createMockCache>;
    let mockPrisma: ReturnType<typeof createMockPrisma>;
    let mockSystemConfig: ReturnType<typeof createMockSystemConfig>;
    let mockProvider: MockEmailProvider;

    beforeEach(() => {
        mockCache = createMockCache();
        mockPrisma = createMockPrisma();
        mockSystemConfig = createMockSystemConfig();
        mockProvider = new MockEmailProvider();
        service = new EmailService(mockCache as any, mockPrisma as any, mockSystemConfig as any, mockProvider);
    });

    // ── sendVerificationCode ──

    describe('sendVerificationCode', () => {
        it('mock 模式下应写入 Redis + verification_code 审计（code 字段不存明文）', async () => {
            const result = await service.sendVerificationCode('user@example.com', 'verify_email', '127.0.0.1');

            expect(result.message).toBe('验证码已发送');
            // 验证码写入 Redis（mock 模式默认 123456）
            const codeKey = 'mono:verify:email:user@example.com';
            const stored = await mockCache.get(codeKey);
            expect(stored).toBe('123456');
            // 间隔标记
            expect(await mockCache.exists('mono:verify:email:interval:user@example.com')).toBe(true);
            // 审计写入（channel='email'，code 字段是 '******'）
            expect(mockPrisma.client.verificationCode.create).toHaveBeenCalled();
            const auditData = mockPrisma.client.verificationCode.create.mock.calls[0][0].data;
            expect(auditData.channel).toBe('email');
            expect(auditData.code).toBe('******');
            expect(auditData.purpose).toBe('verify_email');
        });

        it('发送间隔太短应抛 30101', async () => {
            await service.sendVerificationCode('user@example.com', 'verify_email', '127.0.0.1');
            await expect(
                service.sendVerificationCode('user@example.com', 'verify_email', '127.0.0.1'),
            ).rejects.toMatchObject({
                response: { code: ERROR_CODES.EMAIL_TOO_FREQUENT },
            });
        });

        it('每日发送达上限应抛 30102', async () => {
            await mockCache.setex('mono:verify:email:daily:user@example.com', 86400, '20');
            await expect(
                service.sendVerificationCode('user@example.com', 'verify_email', '127.0.0.1'),
            ).rejects.toMatchObject({
                response: { code: ERROR_CODES.EMAIL_DAILY_LIMIT },
            });
        });
    });

    // ── verifyCode ──

    describe('verifyCode', () => {
        beforeEach(async () => {
            await mockCache.setex('mono:verify:email:user@example.com', 1800, '123456');
        });

        it('正确验证码应通过', async () => {
            await service.verifyCode('user@example.com', '123456', 'verify_email');
            expect(await mockCache.get('mono:verify:email:user@example.com')).toBeNull();
        });

        it('错误验证码应抛 30105 并计数', async () => {
            await expect(service.verifyCode('user@example.com', 'wrong', 'verify_email')).rejects.toMatchObject({
                response: { code: ERROR_CODES.EMAIL_CODE_INVALID },
            });
            const attempts = await mockCache.get('mono:verify:email:attempts:user@example.com');
            expect(attempts).toBe('1');
        });

        it('过期验证码应抛 30104', async () => {
            await mockCache.del('mono:verify:email:user@example.com');
            await expect(service.verifyCode('user@example.com', '123456', 'verify_email')).rejects.toMatchObject({
                response: { code: ERROR_CODES.EMAIL_CODE_EXPIRED },
            });
        });
    });

    // ── sendNotification ──

    describe('sendNotification', () => {
        it('通知邮件不走限流，直接发到 provider', async () => {
            const result = await service.sendNotification('user@example.com', '欢迎加入', '<p>欢迎</p>');
            expect(result.success).toBe(true);
        });
    });
});
