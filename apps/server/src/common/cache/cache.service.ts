import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CACHE_SERVICE_TOKEN, type ICacheService } from './cache.interface.js';

/** 内存后端（Redis 不可用时的降级实现） */
class MemoryCacheBackend implements ICacheService {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    return entry !== undefined && entry.expiresAt < Date.now();
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isExpired(key)) {
      this.store.delete(key);
      return null;
    }
    const entry = this.store.get(key);
    return entry ? (entry.value as T) : null;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    this.store.set(key, { value, expiresAt: ttl ? Date.now() + ttl * 1000 : Infinity });
  }

  async setex(key: string, ttl: number, value: unknown): Promise<void> {
    await this.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  async incr(key: string, ttl: number): Promise<number> {
    const current = (await this.get<number>(key)) ?? 0;
    const next = current + 1;
    await this.setex(key, ttl, next);
    return next;
  }

  async exists(key: string): Promise<boolean> {
    return !this.isExpired(key) && this.store.has(key);
  }
}

/** Redis 后端 */
class RedisCacheBackend implements ICacheService {
  constructor(private readonly client: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttl) {
      await this.client.set(key, raw, 'EX', ttl);
    } else {
      await this.client.set(key, raw);
    }
  }

  async setex(key: string, ttl: number, value: unknown): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttl);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async incr(key: string, ttl: number): Promise<number> {
    const next = await this.client.incr(key);
    if (next === 1) {
      await this.client.expire(key, ttl);
    }
    return next;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }
}

/**
 * 缓存服务：Redis 优先（配置 REDIS_URL），未配置/连接失败自动降级内存。
 * - 认证增强（token 黑名单 / 登录锁定 / refresh 存储）统一走此接口
 */
@Injectable()
export class CacheService implements ICacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly backend: ICacheService;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('REDIS_URL');
    if (url) {
      try {
        const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
        // 主动探测连接，失败即降级内存
        client.on('error', () => undefined);
        this.backend = new RedisCacheBackend(client);
        this.logger.log('Cache: Redis 模式');
      } catch {
        this.backend = new MemoryCacheBackend();
        this.logger.warn('Cache: Redis 初始化失败，降级内存');
      }
    } else {
      this.backend = new MemoryCacheBackend();
      this.logger.log('Cache: 内存模式（未配置 REDIS_URL）');
    }
  }

  get<T>(key: string): Promise<T | null> {
    return this.backend.get<T>(key);
  }

  set(key: string, value: unknown, ttl?: number): Promise<void> {
    return this.backend.set(key, value, ttl);
  }

  setex(key: string, ttl: number, value: unknown): Promise<void> {
    return this.backend.setex(key, ttl, value);
  }

  del(key: string): Promise<void> {
    return this.backend.del(key);
  }

  delByPattern(pattern: string): Promise<void> {
    return this.backend.delByPattern(pattern);
  }

  incr(key: string, ttl: number): Promise<number> {
    return this.backend.incr(key, ttl);
  }

  exists(key: string): Promise<boolean> {
    return this.backend.exists(key);
  }
}

/** 全局缓存模块 */
export { CACHE_SERVICE_TOKEN as CacheServiceToken };
