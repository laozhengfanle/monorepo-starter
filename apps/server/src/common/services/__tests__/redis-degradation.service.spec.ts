/**
 * RedisDegradationService 单元测试
 *
 * 覆盖场景：
 * 1. safeGet 正常路径：返回缓存值
 * 2. safeGet 缓存返回 null/undefined：返回 fallback
 * 3. safeGet 抛错：返回 fallback + 计数 +1
 * 4. tryWithFallback 正常：返回 op 结果
 * 5. tryWithFallback 抛错：返回 fallback 结果
 * 6. getMetrics：返回当前计数快照
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisDegradationService } from '../redis-degradation.service.js';

describe('RedisDegradationService', () => {
    let service: RedisDegradationService;
    const mockCacheService = {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        service = new RedisDegradationService(mockCacheService as never);
    });

    describe('safeGet', () => {
        it('缓存有值 → 返回缓存值', async () => {
            mockCacheService.get.mockResolvedValue('cached-value');

            const result = await service.safeGet<string>('key', 'fallback');

            expect(result).toBe('cached-value');
        });

        it('缓存返回 null → 返回 fallback', async () => {
            mockCacheService.get.mockResolvedValue(null);

            const result = await service.safeGet<string>('key', 'fallback');

            expect(result).toBe('fallback');
        });

        it('缓存抛错 → 返回 fallback + 计数 +1', async () => {
            mockCacheService.get.mockRejectedValue(new Error('Redis down'));

            const result = await service.safeGet<string>('key', 'fallback');

            expect(result).toBe('fallback');
            const metrics = service.getMetrics();
            expect(metrics.redis_degradation_total).toBe(1);
            expect(metrics.lastDegradationAt).toBeInstanceOf(Date);
        });
    });

    describe('tryWithFallback', () => {
        it('主操作成功 → 返回主操作结果', async () => {
            const result = await service.tryWithFallback(
                async () => 'main',
                async () => 'fallback',
            );

            expect(result).toBe('main');
        });

        it('主操作抛错 → 返回 fallback 结果 + 计数 +1', async () => {
            const result = await service.tryWithFallback(
                async () => {
                    throw new Error('op fail');
                },
                async () => 'fallback',
            );

            expect(result).toBe('fallback');
            const metrics = service.getMetrics();
            expect(metrics.redis_degradation_total).toBe(1);
        });

        it('多次抛错 → 计数累加', async () => {
            await service.tryWithFallback(
                async () => {
                    throw new Error('e1');
                },
                async () => null,
            );
            await service.tryWithFallback(
                async () => {
                    throw new Error('e2');
                },
                async () => null,
            );

            const metrics = service.getMetrics();
            expect(metrics.redis_degradation_total).toBe(2);
        });
    });

    describe('getMetrics', () => {
        it('初始 metrics 应为 0 / null', () => {
            const metrics = service.getMetrics();

            expect(metrics.redis_degradation_total).toBe(0);
            expect(metrics.lastDegradationAt).toBeNull();
        });

        it('返回的 metrics 是只读快照（修改不影响内部状态）', async () => {
            mockCacheService.get.mockRejectedValue(new Error('e'));
            await service.safeGet('k', null);

            const m1 = service.getMetrics();
            m1.redis_degradation_total = 999; // 修改外部引用
            const m2 = service.getMetrics();
            /** 内部状态未被外部修改影响 */
            expect(m2.redis_degradation_total).toBe(1);
        });
    });
});
