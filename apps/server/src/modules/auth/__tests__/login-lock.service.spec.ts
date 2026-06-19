/**
 * LoginLockService 单元测试
 *
 * 覆盖场景：
 * - recordFailure: 原子递增 / 锁定阈值触发(账号) / 锁定阈值触发(IP)
 * - isLocked: 未锁定 / 账号锁定 / IP锁定
 * - resetOnSuccess: 清除账号计数 / IP计数不被清除
 * - clear: 清账号计数
 * - 配置读取: system_config 优先 / 回退到环境变量
 * - Redis 降级: Redis 故障时不阻塞
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoginLockService } from '../login-lock.service.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { RedisDegradationService } from '../../../common/services/redis-degradation.service.js';

function createMockCache() {
    const store = new Map<string, any>();
    return {
        get: vi.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null)),
        setex: vi.fn().mockImplementation((key: string, ttl: number, val: any) => {
            store.set(key, val);
            return Promise.resolve();
        }),
        del: vi.fn().mockImplementation((key: string) => {
            store.delete(key);
            return Promise.resolve();
        }),
        evalLua: vi
            .fn()
            .mockImplementation(
                (_script: string, keys: string[], args: (string | number)[], fallback: () => Promise<number>) =>
                    fallback(),
            ),
        delByPattern: vi.fn(),
        mget: vi.fn(),
        setTtlByPattern: vi.fn(),
        exists: vi.fn().mockResolvedValue(false),
        incr: vi.fn(),
        ttl: vi.fn(),
        set: vi.fn(),
    };
}

/** 创建 mock SystemConfigService，模拟从 DB 读取 settings 配置 */
function createMockSystemConfigService(settings?: Record<string, unknown>) {
    return {
        findByKey: vi.fn().mockImplementation((key: string) => {
            if (key === 'settings' && settings) {
                return Promise.resolve({ key: 'settings', value: settings });
            }
            return Promise.reject(new Error(`配置 ${key} 不存在`));
        }),
    } as unknown as SystemConfigService;
}

/** RedisDegradationService mock（透传 + 失败 fallback 模拟） */
function createMockRedisDegradation(failMode: 'normal' | 'fail' = 'normal') {
    return {
        safeGet: vi.fn().mockImplementation(async (key: string, fallback: any) => {
            if (failMode === 'fail') {
                return fallback;
            }
            /** 透传到 cache.get（用 call 调用 cache） */
            return mockCacheProxy?.get?.(key) ?? fallback;
        }),
        tryWithFallback: vi.fn().mockImplementation(async (op: () => Promise<any>, fb: () => Promise<any>) => {
            if (failMode === 'fail') {
                return fb();
            }
            return op();
        }),
        getMetrics: vi.fn().mockReturnValue({ redis_degradation_total: 0, lastDegradationAt: null }),
    } as unknown as RedisDegradationService;
}

let mockCacheProxy: any;

describe('LoginLockService', () => {
    let service: LoginLockService;
    let mockCache: ReturnType<typeof createMockCache>;
    let mockRedisDegradation: RedisDegradationService;

    beforeEach(() => {
        mockCache = createMockCache();
        mockCacheProxy = mockCache;
        const configService = {
            get: (key: string) => {
                if (key === 'auth.THROTTLE_LOGIN_LIMIT') return '5';
                if (key === 'auth.THROTTLE_IP_LIMIT') return '50';
                if (key === 'auth.THROTTLE_LOGIN_TTL') return '900';
                return undefined;
            },
        };
        const mockSystemConfig = createMockSystemConfigService({
            loginFailThreshold: 5,
            lockDuration: 30,
        });
        mockRedisDegradation = createMockRedisDegradation('normal');
        service = new LoginLockService(mockCache as any, configService as any, mockSystemConfig, mockRedisDegradation);
    });

    // ── recordFailure ──

    describe('recordFailure', () => {
        it('首次失败应返回 locked=false', async () => {
            const result = await service.recordFailure('acc-1', '192.168.1.1');
            expect(result.locked).toBe(false);
        });

        it('连续5次失败应在第5次触发锁定', async () => {
            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:lock:login:acc-1') return Promise.resolve(4);
                return Promise.resolve(null);
            });

            const result = await service.recordFailure('acc-1', '192.168.1.1');
            expect(result.locked).toBe(true);
        });

        it('IP 达到50次应触发锁定', async () => {
            mockCache.get.mockImplementation((key: string) => {
                if (key.startsWith('mono:lock:login:ip:')) return Promise.resolve(50);
                return Promise.resolve(null);
            });

            const result = await service.recordFailure('acc-1', '192.168.1.1');
            expect(result.locked).toBe(true);
        });

        it('应同时递增账号和IP的失败计数', async () => {
            await service.recordFailure('acc-1', '192.168.1.1');

            // evalLua fallback 会调用 setex（账号 + IP = 2次）
            expect(mockCache.evalLua).toHaveBeenCalledTimes(2);
        });
    });

    // ── isLocked ──

    describe('isLocked', () => {
        it('未达到阈值应返回 false', async () => {
            mockCache.get.mockResolvedValue(null);
            const result = await service.isLocked('acc-1', '192.168.1.1');
            expect(result).toBe(false);
        });

        it('账号达到5次应返回 true', async () => {
            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:lock:login:acc-1') return Promise.resolve(5);
                return Promise.resolve(null);
            });
            const result = await service.isLocked('acc-1', '192.168.1.1');
            expect(result).toBe(true);
        });

        it('IP达到50次应返回 true', async () => {
            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:lock:login:ip:192.168.1.1') return Promise.resolve(50);
                return Promise.resolve(null);
            });
            const result = await service.isLocked('acc-1', '192.168.1.1');
            expect(result).toBe(true);
        });
    });

    // ── resetOnSuccess ──

    describe('resetOnSuccess', () => {
        it('应只删除账号计数，保留 IP 计数', async () => {
            await service.resetOnSuccess('acc-1');

            expect(mockCache.del).toHaveBeenCalledWith('mono:lock:login:acc-1');
            expect(mockCache.del).toHaveBeenCalledTimes(1);
        });
    });

    // ── clear ──

    describe('clear', () => {
        it('应清空账号失败计数', async () => {
            await service.clear('acc-1');

            expect(mockCache.del).toHaveBeenCalledWith('mono:lock:login:acc-1');
        });
    });

    // ── 配置读取 ──

    describe('配置动态读取', () => {
        it('应从 system_config 读取 loginFailThreshold', async () => {
            const mockSystemConfig = createMockSystemConfigService({
                loginFailThreshold: 3,
                lockDuration: 15,
            });
            const configService = { get: () => undefined };
            service = new LoginLockService(
                mockCache as any,
                configService as any,
                mockSystemConfig,
                mockRedisDegradation,
            );

            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:lock:login:acc-1') return Promise.resolve(3);
                return Promise.resolve(null);
            });

            const result = await service.isLocked('acc-1', '192.168.1.1');
            expect(result).toBe(true);
        });

        it('system_config 读取失败时应回退到环境变量', async () => {
            const mockSystemConfig = createMockSystemConfigService(undefined);
            const configService = {
                get: (key: string) => {
                    if (key === 'auth.THROTTLE_LOGIN_LIMIT') return '5';
                    if (key === 'auth.THROTTLE_IP_LIMIT') return '50';
                    if (key === 'auth.THROTTLE_LOGIN_TTL') return '900';
                    return undefined;
                },
            };
            service = new LoginLockService(
                mockCache as any,
                configService as any,
                mockSystemConfig,
                mockRedisDegradation,
            );

            mockCache.get.mockImplementation((key: string) => {
                if (key === 'mono:lock:login:acc-1') return Promise.resolve(5);
                return Promise.resolve(null);
            });

            const result = await service.isLocked('acc-1', '192.168.1.1');
            expect(result).toBe(true);
        });
    });

    // ── Redis 降级 ──

    describe('Redis 降级', () => {
        it('isLocked：Redis 故障时降级为 false（不视为锁定）', async () => {
            const failDegradation = createMockRedisDegradation('fail');
            service = new LoginLockService(
                mockCache as any,
                { get: () => undefined } as any,
                createMockSystemConfigService({ loginFailThreshold: 5, lockDuration: 30 }),
                failDegradation,
            );

            const result = await service.isLocked('acc-1', '192.168.1.1');
            expect(result).toBe(false);
        });

        it('recordFailure：Redis 故障时降级为 locked=false', async () => {
            const failDegradation = createMockRedisDegradation('fail');
            service = new LoginLockService(
                mockCache as any,
                { get: () => undefined } as any,
                createMockSystemConfigService({ loginFailThreshold: 5, lockDuration: 30 }),
                failDegradation,
            );

            const result = await service.recordFailure('acc-1', '192.168.1.1');
            expect(result.locked).toBe(false);
        });
    });
});
