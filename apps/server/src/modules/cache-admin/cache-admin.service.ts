import { Inject, Injectable } from '@nestjs/common';
import { BizException } from '@starter/server-core';
import type { CacheKey, CacheStats } from '@starter/contracts';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';

/** 列表单页最大 key 数（防止 OOM） */
const MAX_KEYS_PER_PAGE = 500;
/** 批量删除单次上限 */
const MAX_BATCH_DELETE = 1000;

/**
 * 缓存管理服务（运维侧 API）
 * - listKeys / getValue / delete / deleteKeys / clearByPattern / getStats
 * - SCAN 而非 KEYS *；pattern 安全校验（拒纯通配符）
 */
@Injectable()
export class CacheAdminService {
  constructor(@Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService) {}

  /** 按 pattern 列出缓存 key（分页，limit ≤ 500） */
  async listKeys(pattern: string, offset: number, limit: number): Promise<{ items: CacheKey[]; total: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), MAX_KEYS_PER_PAGE);
    const safeOffset = Math.max(offset, 0);
    const allKeys = await this.cache.scanKeys(pattern || '*');
    const pageKeys = allKeys.slice(safeOffset, safeOffset + safeLimit);
    const items = await Promise.all(
      pageKeys.map(async (key) => {
        const [type, ttl, rawValue] = await Promise.all([
          this.cache.getKeyType(key),
          this.cache.ttl(key),
          this.cache.get<unknown>(key),
        ]);
        let valueStr: string | null = null;
        if (rawValue !== null && rawValue !== undefined) {
          valueStr = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
        }
        return {
          key,
          type,
          ttl,
          value: valueStr,
          size: valueStr ? valueStr.length : 0,
        };
      }),
    );
    return { items, total: allKeys.length };
  }

  /** 查询单个 key 完整信息 */
  async getValue(key: string): Promise<CacheKey> {
    const [type, ttl, rawValue] = await Promise.all([
      this.cache.getKeyType(key),
      this.cache.ttl(key),
      this.cache.get<unknown>(key),
    ]);
    let valueStr: string | null = null;
    if (rawValue !== null && rawValue !== undefined) {
      valueStr = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
    }
    return {
      key,
      type,
      ttl,
      value: valueStr,
      size: valueStr ? valueStr.length : 0,
    };
  }

  /** 删除单个 key（不存在返回 false） */
  async delete(key: string): Promise<boolean> {
    const existed = await this.cache.exists(key);
    await this.cache.del(key);
    return existed;
  }

  /** 批量删除（单次上限 1000） */
  async deleteKeys(keys: string[]): Promise<{ deletedCount: number; keys: string[] }> {
    if (keys.length > MAX_BATCH_DELETE) {
      throw new BizException({
        code: 'CACHE_BATCH_TOO_LARGE',
        message: `单次最多删除 ${MAX_BATCH_DELETE} 个 key`,
      });
    }
    let deletedCount = 0;
    for (const key of keys) {
      if (await this.cache.exists(key)) {
        await this.cache.del(key);
        deletedCount += 1;
      }
    }
    return { deletedCount, keys };
  }

  /** 按 pattern 清空（安全校验：拒绝纯通配符 / 以 * 开头） */
  async clearByPattern(pattern: string): Promise<number> {
    this.assertSafePattern(pattern);
    const keys = await this.cache.scanKeys(pattern);
    for (const key of keys) {
      await this.cache.del(key);
    }
    return keys.length;
  }

  /** 缓存运行统计 */
  async getStats(): Promise<CacheStats> {
    const stats = await this.cache.getStats();
    return {
      usedMemory: stats.usedMemory,
      hitRate: stats.hitRate,
      uptime: stats.uptime,
    };
  }

  /**
   * pattern 安全校验：非空、去掉通配符后必须还有具体字符、不允许以 * 开头
   * （防止误清全库）
   */
  private assertSafePattern(pattern: string): void {
    const trimmed = pattern.trim();
    if (!trimmed) {
      throw new BizException({ code: 'CACHE_PATTERN_EMPTY', message: '请输入要清空的 key 模式' });
    }
    if (/^\*/.test(trimmed)) {
      throw new BizException({ code: 'CACHE_PATTERN_UNSAFE', message: '模式不能以 * 开头' });
    }
    const concrete = trimmed.replace(/[*?[\]]/g, '');
    if (!concrete) {
      throw new BizException({ code: 'CACHE_PATTERN_UNSAFE', message: '模式必须包含具体字符' });
    }
  }
}
