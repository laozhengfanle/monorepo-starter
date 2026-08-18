import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  CACHE_SERVICE_TOKEN,
  type CacheStatsInfo,
  type ICacheService,
} from './cache.interface.js';

/** 通配符模式 → 正则（* → .*，其余转义） */
function patternToRegex(pattern: string): RegExp {
  return new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
  );
}

/** 内存后端（Redis 不可用时的降级实现） */
class MemoryCacheBackend implements ICacheService {
  private readonly store = new Map<
    string,
    { value: unknown; expiresAt: number }
  >();
  /** 创建时间戳（uptime 统计用） */
  private readonly createdAt = Date.now();

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
    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : Infinity,
    });
  }

  async setex(key: string, ttl: number, value: unknown): Promise<void> {
    await this.set(key, value, ttl);
  }

  async setnx(key: string, value: unknown, ttl?: number): Promise<boolean> {
    // 已存在（未过期）则认领失败；JS 单线程下「检查 + 写入」之间无并发窗口，天然原子
    if (await this.exists(key)) {
      return false;
    }
    await this.set(key, value, ttl);
    return true;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    const regex = patternToRegex(pattern);
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  async incr(key: string, ttl: number): Promise<number> {
    const current = (await this.get<number>(key)) ?? 0;
    const next = current + 1;
    const entry = this.store.get(key);
    if (entry) {
      // 固定窗口：键已存在只递增，不重置 TTL（与 Redis 后端 INCR + 首次 EXPIRE 语义对齐，
      // 保证登录锁定窗口从第一次失败开始计时，两端实现行为一致）
      this.store.set(key, { value: next, expiresAt: entry.expiresAt });
    } else {
      // 键不存在（或已过期被 get 清理）：首次计数并设置 TTL
      this.store.set(key, { value: next, expiresAt: Date.now() + ttl * 1000 });
    }
    return next;
  }

  async exists(key: string): Promise<boolean> {
    return !this.isExpired(key) && this.store.has(key);
  }

  async scanKeys(pattern: string): Promise<string[]> {
    const regex = patternToRegex(pattern);
    return [...this.store.keys()].filter((key) => regex.test(key));
  }

  async getKeyType(_key: string): Promise<string> {
    return 'string';
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(key)) {
      return -2;
    }
    if (entry.expiresAt === Infinity) {
      return -1;
    }
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async getStats(): Promise<CacheStatsInfo> {
    const seconds = Math.floor((Date.now() - this.createdAt) / 1000);
    return {
      usedMemory: `${this.store.size} 条`,
      hitRate: '—',
      uptime: formatUptime(seconds),
    };
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

  async setnx(key: string, value: unknown, ttl?: number): Promise<boolean> {
    // SET key value EX ttl NX：仅当 key 不存在时写入，Redis 单命令原子
    const raw = JSON.stringify(value);
    const result = ttl
      ? await this.client.set(key, raw, 'EX', ttl, 'NX')
      : await this.client.set(key, raw, 'NX');
    return result === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async incr(key: string, ttl: number): Promise<number> {
    // INCR 为 Redis 单命令，天然原子；仅当返回 1（首次）时补 EXPIRE ——
    // 固定窗口语义：已有键不重置 TTL（与内存后端行为一致）。
    // 极端竞态（键恰好在本请求 incr 后、expire 前过期并被其他请求重建）只会把
    // TTL 套在重建后的键上，窗口误差可忽略，不影响锁定正确性。
    const next = await this.client.incr(key);
    if (next === 1) {
      await this.client.expire(key, ttl);
    }
    return next;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      // SCAN 游标 + MATCH + COUNT（禁用 KEYS *，避免阻塞生产 Redis）
      const [nextCursor, batch] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return [...new Set(keys)];
  }

  async getKeyType(key: string): Promise<string> {
    return this.client.type(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async getStats(): Promise<CacheStatsInfo> {
    const info = await this.client.info('stats');
    const usedMemoryRaw = await this.client.info('memory');
    const serverRaw = await this.client.info('server');

    const parse = (section: string, field: string): string => {
      const match = section.match(new RegExp(`^${field}:(.*)$`, 'm'));
      return match ? match[1]!.trim() : '';
    };

    const hits = Number(parse(info, 'keyspace_hits')) || 0;
    const misses = Number(parse(info, 'keyspace_misses')) || 0;
    const hitRate =
      hits + misses > 0
        ? ((hits / (hits + misses)) * 100).toFixed(2) + '%'
        : '—';
    const uptimeSeconds = Number(parse(serverRaw, 'uptime_in_seconds')) || 0;
    return {
      usedMemory: formatBytes(Number(parse(usedMemoryRaw, 'used_memory')) || 0),
      hitRate,
      uptime: formatUptime(uptimeSeconds),
    };
  }
}

/** 字节数 → 人类可读（如 "1.23 MB"） */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 秒数 → 人类可读（如 "3 天 5 小时"） */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
}

/**
 * 缓存服务：Redis 优先（配置 REDIS_URL），未配置/连接失败/运行中不可用自动降级内存。
 * - 认证增强（token 黑名单 / 登录锁定 / refresh 存储）统一走此接口
 * - 降级策略：构造后主动 ping 探测 + 首次操作失败即切换内存（记录告警日志），
 *   后续请求全部走内存，保证登录/锁定/黑名单路径在 Redis 挂掉时不 500
 */
@Injectable()
export class CacheService implements ICacheService {
  private readonly logger = new Logger(CacheService.name);
  private backend: ICacheService;
  /** 内存降级后端（恒存在：未配置 Redis 或 Redis 故障时兜底） */
  private readonly memoryBackend = new MemoryCacheBackend();
  /** 是否已降级内存（一旦降级不再回退，避免在故障/恢复间抖动） */
  private fallbackActive = false;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('REDIS_URL');
    if (url) {
      const client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      // 必须监听 error：连接拒绝/断线时 ioredis 会 emit error，未监听会抛未捕获异常
      client.on('error', () => undefined);
      this.backend = new RedisCacheBackend(client);
      this.logger.log('Cache: Redis 模式（故障自动降级内存）');
      // 主动探测：构造后立即 ping，失败即刻切内存，避免首个请求被连接超时拖慢/抛错
      void client.ping().catch((err) => {
        this.fallbackToMemory(`连接探测失败: ${(err as Error).message}`);
      });
    } else {
      this.backend = this.memoryBackend;
      this.logger.log('Cache: 内存模式（未配置 REDIS_URL）');
    }
  }

  /** 统一执行入口：Redis 操作失败即降级内存并重放该操作（fail-open，不抛 500） */
  private async withBackend<T>(
    op: (backend: ICacheService) => Promise<T>,
  ): Promise<T> {
    if (this.fallbackActive) {
      return op(this.memoryBackend);
    }
    try {
      return await op(this.backend);
    } catch (err) {
      this.fallbackToMemory(`操作失败: ${(err as Error).message}`);
      return op(this.memoryBackend);
    }
  }

  /** 切换内存后端（幂等，只告警一次） */
  private fallbackToMemory(reason: string): void {
    if (this.fallbackActive) {
      return;
    }
    this.fallbackActive = true;
    this.backend = this.memoryBackend;
    this.logger.warn(`Cache: Redis 不可用（${reason}），已降级内存模式`);
  }

  get<T>(key: string): Promise<T | null> {
    return this.withBackend((b) => b.get<T>(key));
  }

  set(key: string, value: unknown, ttl?: number): Promise<void> {
    return this.withBackend((b) => b.set(key, value, ttl));
  }

  setex(key: string, ttl: number, value: unknown): Promise<void> {
    return this.withBackend((b) => b.setex(key, ttl, value));
  }

  setnx(key: string, value: unknown, ttl?: number): Promise<boolean> {
    return this.withBackend((b) => b.setnx(key, value, ttl));
  }

  del(key: string): Promise<void> {
    return this.withBackend((b) => b.del(key));
  }

  delByPattern(pattern: string): Promise<void> {
    return this.withBackend((b) => b.delByPattern(pattern));
  }

  incr(key: string, ttl: number): Promise<number> {
    return this.withBackend((b) => b.incr(key, ttl));
  }

  exists(key: string): Promise<boolean> {
    return this.withBackend((b) => b.exists(key));
  }

  scanKeys(pattern: string): Promise<string[]> {
    return this.withBackend((b) => b.scanKeys(pattern));
  }

  getKeyType(key: string): Promise<string> {
    return this.withBackend((b) => b.getKeyType(key));
  }

  ttl(key: string): Promise<number> {
    return this.withBackend((b) => b.ttl(key));
  }

  getStats(): Promise<CacheStatsInfo> {
    return this.withBackend((b) => b.getStats());
  }
}

/** 全局缓存模块 */
export { CACHE_SERVICE_TOKEN as CacheServiceToken };
