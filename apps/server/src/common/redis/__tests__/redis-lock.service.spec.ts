/**
 * RedisLockService 单元测试（内存模式）
 *
 * 覆盖：
 * - acquire 成功 / 失败（已被持有）
 * - release 成功 / 失败（owner 不匹配）
 * - extend 成功 / 失败
 * - 并发场景：100 个 acquire Promise.all → 仅 1 个成功
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { RedisLockService } from '../redis-lock.service';

function createMockConfigService(redisUrl: string | undefined = undefined): ConfigService {
    return {
        get: vi.fn().mockImplementation((key: string) => (key === 'redis.REDIS_URL' ? redisUrl : undefined)),
    } as unknown as ConfigService;
}

describe('RedisLockService（内存模式）', () => {
    let service: RedisLockService;

    beforeEach(() => {
        vi.clearAllMocks();
        // 不传 REDIS_URL → 强制走内存模式
        service = new RedisLockService(null, createMockConfigService(undefined));
    });

    describe('acquire', () => {
        it('首次 acquire 返回 owner（UUID）', async () => {
            const owner = await service.acquire('test:key', 5000);
            expect(owner).toBeTruthy();
            expect(typeof owner).toBe('string');
            // UUID v4 长度 36
            expect(owner!.length).toBeGreaterThan(20);
        });

        it('锁被持有时再次 acquire 返回 null', async () => {
            const owner1 = await service.acquire('test:key', 5000);
            expect(owner1).toBeTruthy();
            const owner2 = await service.acquire('test:key', 5000);
            expect(owner2).toBeNull();
        });

        it('锁过期后可重新 acquire', async () => {
            const owner1 = await service.acquire('test:key', 50); // 50ms TTL
            expect(owner1).toBeTruthy();
            await new Promise((resolve) => setTimeout(resolve, 80));
            const owner2 = await service.acquire('test:key', 5000);
            expect(owner2).toBeTruthy();
        });

        it('不同 key 互不影响', async () => {
            const owner1 = await service.acquire('key:a', 5000);
            const owner2 = await service.acquire('key:b', 5000);
            expect(owner1).toBeTruthy();
            expect(owner2).toBeTruthy();
        });
    });

    describe('release', () => {
        it('owner 匹配时 release 返回 true', async () => {
            const owner = await service.acquire('test:key', 5000);
            const released = await service.release('test:key', owner!);
            expect(released).toBe(true);
        });

        it('owner 不匹配时 release 返回 false（防误删）', async () => {
            await service.acquire('test:key', 5000);
            const released = await service.release('test:key', 'wrong-owner');
            expect(released).toBe(false);
        });

        it('锁不存在时 release 返回 false', async () => {
            const released = await service.release('nonexistent', 'any-owner');
            expect(released).toBe(false);
        });

        it('释放后其他 acquire 可成功', async () => {
            const owner1 = await service.acquire('test:key', 5000);
            await service.release('test:key', owner1!);
            const owner2 = await service.acquire('test:key', 5000);
            expect(owner2).toBeTruthy();
        });
    });

    describe('extend', () => {
        it('owner 匹配时 extend 返回 true 且延长 TTL', async () => {
            const owner = await service.acquire('test:key', 100); // 100ms
            const extended = await service.extend('test:key', owner!, 5000);
            expect(extended).toBe(true);
            // 150ms 后锁应仍存在（原 100ms 已过期，被 extend 到 5000ms）
            await new Promise((resolve) => setTimeout(resolve, 150));
            const stillHeld = await service.isLocked('test:key');
            expect(stillHeld).toBe(true);
        });

        it('owner 不匹配时 extend 返回 false', async () => {
            await service.acquire('test:key', 5000);
            const extended = await service.extend('test:key', 'wrong-owner', 5000);
            expect(extended).toBe(false);
        });
    });

    describe('isLocked', () => {
        it('acquire 后 isLocked 返回 true', async () => {
            await service.acquire('test:key', 5000);
            expect(await service.isLocked('test:key')).toBe(true);
        });

        it('未 acquire 的 key isLocked 返回 false', async () => {
            expect(await service.isLocked('nonexistent')).toBe(false);
        });

        it('TTL 过期后 isLocked 返回 false', async () => {
            await service.acquire('test:key', 50);
            await new Promise((resolve) => setTimeout(resolve, 80));
            expect(await service.isLocked('test:key')).toBe(false);
        });
    });

    describe('并发场景', () => {
        it('100 个并发 acquire 同一 key → 仅 1 个成功', async () => {
            const results = await Promise.all(
                Array.from({ length: 100 }, () => service.acquire('concurrent:key', 5000)),
            );
            const successCount = results.filter((r) => r !== null).length;
            const failCount = results.filter((r) => r === null).length;
            expect(successCount).toBe(1);
            expect(failCount).toBe(99);
        });
    });
});
