import { Inject, Injectable } from '@nestjs/common';
import { BizException } from '@starter/server-core';
import {
  CacheListQuerySchema,
  ClearCachePatternInputSchema,
  DeleteCacheKeysInputSchema,
} from '@starter/contracts';
import type { CacheKey, CacheListQuery, CacheStats } from '@starter/contracts';
import {
  CACHE_SERVICE_TOKEN,
  type ICacheService,
} from '../../common/cache/cache.interface.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

/**
 * 缓存管理服务（运维侧 API）
 * - listKeys / getValue / delete / deleteKeys / clearByPattern / getStats
 * - SCAN 而非 KEYS *；pattern 安全校验（拒纯通配符）
 * - 长度/范围校验由 @starter/contracts 的 zod schema 统一承担（limit ≤ 500、批量 ≤ 1000）
 * - 三个写操作（delete / deleteKeys / clearByPattern）成功后写安全审计
 *   （动作词表见 audit.constants.ts：cache_key_deleted / cache_pattern_cleared）
 */
@Injectable()
export class CacheAdminService {
  constructor(
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    private readonly audit: AuditService,
  ) {}

  /** 按 pattern 列出缓存 key（分页，limit 由 CacheListQuerySchema 限制 ≤ 500） */
  async listKeys(
    query: CacheListQuery,
  ): Promise<{ items: CacheKey[]; total: number }> {
    const { pattern, offset, limit } = CacheListQuerySchema.parse(query);
    const allKeys = await this.cache.scanKeys(pattern || '*');
    const pageKeys = allKeys.slice(offset, offset + limit);
    const items = await Promise.all(
      pageKeys.map(async (key) => {
        const [type, ttl, rawValue] = await Promise.all([
          this.cache.getKeyType(key),
          this.cache.ttl(key),
          this.cache.get<unknown>(key),
        ]);
        let valueStr: string | null = null;
        if (rawValue !== null && rawValue !== undefined) {
          valueStr =
            typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
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
      valueStr =
        typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
    }
    return {
      key,
      type,
      ttl,
      value: valueStr,
      size: valueStr ? valueStr.length : 0,
    };
  }

  /** 删除单个 key（不存在返回 false；成功后写审计） */
  async delete(key: string, operatorId: string): Promise<boolean> {
    const existed = await this.cache.exists(key);
    await this.cache.del(key);
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.CACHE_KEY_DELETED,
      detail: { key, existed },
    });
    return existed;
  }

  /** 批量删除（数量上限由 DeleteCacheKeysInputSchema 限制 ≤ 1000；成功后写审计） */
  async deleteKeys(
    keys: string[],
    operatorId: string,
  ): Promise<{ deletedCount: number; keys: string[] }> {
    const { keys: parsedKeys } = DeleteCacheKeysInputSchema.parse({ keys });
    let deletedCount = 0;
    for (const key of parsedKeys) {
      if (await this.cache.exists(key)) {
        await this.cache.del(key);
        deletedCount += 1;
      }
    }
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.CACHE_KEY_DELETED,
      detail: { keys: parsedKeys, deletedCount },
    });
    return { deletedCount, keys: parsedKeys };
  }

  /** 按 pattern 清空（长度校验走 schema；安全校验保留在 service：拒绝纯通配符 / 以 * 开头；成功后写审计） */
  async clearByPattern(pattern: string, operatorId: string): Promise<number> {
    ClearCachePatternInputSchema.parse({ pattern });
    this.assertSafePattern(pattern);
    const keys = await this.cache.scanKeys(pattern);
    for (const key of keys) {
      await this.cache.del(key);
    }
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.CACHE_PATTERN_CLEARED,
      detail: { pattern, deletedCount: keys.length },
    });
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
      throw new BizException({
        code: 'CACHE_PATTERN_EMPTY',
        message: '请输入要清空的 key 模式',
      });
    }
    if (/^\*/.test(trimmed)) {
      throw new BizException({
        code: 'CACHE_PATTERN_UNSAFE',
        message: '模式不能以 * 开头',
      });
    }
    const concrete = trimmed.replace(/[*?[\]]/g, '');
    if (!concrete) {
      throw new BizException({
        code: 'CACHE_PATTERN_UNSAFE',
        message: '模式必须包含具体字符',
      });
    }
  }
}
