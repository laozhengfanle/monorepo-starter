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
import { maskSensitiveValue } from '../system-config/system-config.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

/**
 * 安全前缀黑名单（P1-3 修复）：这些命名空间承载认证/人机验证等安全状态，
 * 缓存管理页一律禁止读取/删除/清空——
 * - auth:*       登录锁定计数、refresh reuse 标记、jti 撤销缓存：可被用来绕过锁定 / 重放
 * - turnstile:*  人机验证防重放标记：可被用来重放 token
 * 如需运维操作请走专门的管理入口（如解锁账户），不要暴露在通用缓存管理里。
 */
const PROTECTED_CACHE_PREFIXES: readonly string[] = ['auth:', 'turnstile:'];

/** 命中保护前缀即拒绝（key 级） */
function isProtectedKey(key: string): boolean {
  return PROTECTED_CACHE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * 缓存管理服务（运维侧 API）
 * - listKeys / getValue / delete / deleteKeys / clearByPattern / getStats
 * - SCAN 而非 KEYS *；pattern 安全校验（拒纯通配符）
 * - 长度/范围校验由 @starter/contracts 的 zod schema 统一承担（limit ≤ 500、批量 ≤ 1000）
 * - 安全护栏（P1-3）：auth:* / turnstile:* 等安全键禁读禁删禁清；sys:config:* 值脱敏后返回
 * - 三个写操作（delete / deleteKeys / clearByPattern）成功后写安全审计
 *   （动作词表见 audit.constants.ts：cache_key_deleted / cache_pattern_cleared）
 */
@Injectable()
export class CacheAdminService {
  constructor(
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    private readonly audit: AuditService,
  ) {}

  /** 按 pattern 列出缓存 key（分页，limit 由 CacheListQuerySchema 限制 ≤ 500；安全键与敏感值已过滤/脱敏） */
  async listKeys(
    query: CacheListQuery,
  ): Promise<{ items: CacheKey[]; total: number }> {
    const { pattern, offset, limit } = CacheListQuerySchema.parse(query);
    const allKeys = (await this.cache.scanKeys(pattern || '*')).filter(
      (key) => !isProtectedKey(key),
    );
    const pageKeys = allKeys.slice(offset, offset + limit);
    const items = await Promise.all(
      pageKeys.map(async (key) => this.describeKey(key)),
    );
    return { items, total: allKeys.length };
  }

  /** 查询单个 key 完整信息（安全键拒绝；sys:config:* 敏感字段脱敏） */
  async getValue(key: string): Promise<CacheKey> {
    this.assertKeyAllowed(key);
    return this.describeKey(key);
  }

  /** 删除单个 key（不存在返回 false；成功后写审计；安全键拒绝） */
  async delete(key: string, operatorId: string): Promise<boolean> {
    this.assertKeyAllowed(key);
    const existed = await this.cache.exists(key);
    await this.cache.del(key);
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.CACHE_KEY_DELETED,
      detail: { key, existed },
    });
    return existed;
  }

  /** 批量删除（数量上限由 DeleteCacheKeysInputSchema 限制 ≤ 1000；成功后写审计；安全键整批拒绝） */
  async deleteKeys(
    keys: string[],
    operatorId: string,
  ): Promise<{ deletedCount: number; keys: string[] }> {
    const { keys: parsedKeys } = DeleteCacheKeysInputSchema.parse({ keys });
    for (const key of parsedKeys) {
      this.assertKeyAllowed(key);
    }
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

  /** 按 pattern 清空（长度校验走 schema；安全校验保留在 service：拒绝纯通配符 / 以 * 开头 / 命中安全前缀；成功后写审计） */
  async clearByPattern(pattern: string, operatorId: string): Promise<number> {
    ClearCachePatternInputSchema.parse({ pattern });
    this.assertSafePattern(pattern);
    const keys = await this.cache.scanKeys(pattern);
    const deletable = keys.filter((key) => !isProtectedKey(key));
    for (const key of deletable) {
      await this.cache.del(key);
    }
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.CACHE_PATTERN_CLEARED,
      detail: { pattern, deletedCount: deletable.length },
    });
    return deletable.length;
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

  /** 读取单个 key 并组装返回（sys:config:* 敏感字段脱敏） */
  private async describeKey(key: string): Promise<CacheKey> {
    const [type, ttl, rawValue] = await Promise.all([
      this.cache.getKeyType(key),
      this.cache.ttl(key),
      this.cache.get<unknown>(key),
    ]);
    const value = this.maskIfSensitive(key, rawValue);
    let valueStr: string | null = null;
    if (value !== null && value !== undefined) {
      valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return {
      key,
      type,
      ttl,
      value: valueStr,
      size: valueStr ? valueStr.length : 0,
    };
  }

  /** sys:config:* 的缓存值做字段级脱敏（与 system-config.service 同一份敏感字段表） */
  private maskIfSensitive(key: string, rawValue: unknown): unknown {
    if (!key.startsWith('sys:config:')) {
      return rawValue;
    }
    const configKey = key.slice('sys:config:'.length);
    return maskSensitiveValue(configKey, rawValue);
  }

  /** key 级安全校验：命中保护前缀即拒绝 */
  private assertKeyAllowed(key: string): void {
    if (isProtectedKey(key)) {
      throw new BizException({
        code: 'CACHE_KEY_FORBIDDEN',
        message: '该缓存键属于安全命名空间，禁止通过缓存管理页访问',
      });
    }
  }

  /**
   * pattern 安全校验：非空、去掉通配符后必须还有具体字符、不允许以 * 开头、
   * 不允许匹配安全前缀（auth:* / turnstile:* 的任意变体）
   * （防止误清全库 / 绕过登录锁定与防重放）
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
    if (PROTECTED_CACHE_PREFIXES.some((p) => trimmed.startsWith(p))) {
      throw new BizException({
        code: 'CACHE_PATTERN_FORBIDDEN',
        message: '该模式命中安全命名空间，禁止清空',
      });
    }
  }
}
