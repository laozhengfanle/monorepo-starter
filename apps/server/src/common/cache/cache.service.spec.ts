import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { CacheService } from './cache.service.js';

/** 内存模式 CacheService（不配 REDIS_URL，走 MemoryCacheBackend 全功能） */
async function createMemoryCache() {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CacheService,
      {
        provide: ConfigService,
        useValue: { get: () => undefined }, // 无 REDIS_URL → 内存模式
      },
    ],
  }).compile();
  return moduleRef.get(CacheService);
}

describe('CacheService（内存模式）', () => {
  it('get/set 往返 + TTL 过期', async () => {
    const cache = await createMemoryCache();
    await cache.set('k1', { a: 1 });
    expect(await cache.get('k1')).toEqual({ a: 1 });

    // TTL 1 秒，等待过期
    await cache.set('short', 'x', 1);
    expect(await cache.get('short')).toBe('x');
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache.get('short')).toBeNull();
  });

  it('setex 等价 set with TTL', async () => {
    const cache = await createMemoryCache();
    await cache.setex('k', 60, 'v');
    expect(await cache.get('k')).toBe('v');
  });

  it('incr：首次为 1，累加递增', async () => {
    const cache = await createMemoryCache();
    expect(await cache.incr('counter', 60)).toBe(1);
    expect(await cache.incr('counter', 60)).toBe(2);
    expect(await cache.incr('counter', 60)).toBe(3);
  });

  it('incr：固定窗口（已存在键不重置 TTL，与 Redis 后端 INCR+首次 EXPIRE 语义一致）', async () => {
    const cache = await createMemoryCache();
    await cache.incr('window', 5);
    // 等 1.1s 让 TTL 从 5 衰减到 ~3.9
    await new Promise((r) => setTimeout(r, 1100));
    await cache.incr('window', 5);
    // 若滑动窗口（每次重置 TTL）此处会回到 5；固定窗口应保持衰减后的值（< 5）
    const ttl = await cache.ttl('window');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThan(5);
    expect(await cache.get('window')).toBe(2);
  });

  it('exists / del', async () => {
    const cache = await createMemoryCache();
    expect(await cache.exists('nope')).toBe(false);
    await cache.set('k', 'v');
    expect(await cache.exists('k')).toBe(true);
    await cache.del('k');
    expect(await cache.exists('k')).toBe(false);
  });

  it('scanKeys：通配符匹配', async () => {
    const cache = await createMemoryCache();
    await cache.set('sys:config:a', 1);
    await cache.set('sys:config:b', 2);
    await cache.set('auth:lock:acc-1', 3);

    const keys = await cache.scanKeys('sys:config:*');
    expect(keys.sort()).toEqual(['sys:config:a', 'sys:config:b']);
  });

  it('delByPattern：按模式批量删除', async () => {
    const cache = await createMemoryCache();
    await cache.set('tmp:1', 'a');
    await cache.set('tmp:2', 'b');
    await cache.set('keep:1', 'c');

    await cache.delByPattern('tmp:*');

    expect(await cache.exists('tmp:1')).toBe(false);
    expect(await cache.exists('tmp:2')).toBe(false);
    expect(await cache.exists('keep:1')).toBe(true);
  });

  it('ttl：无 TTL 返回 -1，过期返回 -2', async () => {
    const cache = await createMemoryCache();
    await cache.set('forever', 'x');
    expect(await cache.ttl('forever')).toBe(-1);

    await cache.set('expiring', 'x', 1);
    expect(await cache.ttl('expiring')).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache.ttl('expiring')).toBe(-2);
  });
});
