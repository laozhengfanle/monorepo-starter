import { Inject, Injectable } from '@nestjs/common';
import { BizException, newId } from '@starter/server-core';
import {
  BatchUpdateConfigsSchema,
  SystemConfig,
  UpdateConfigSchema,
} from '@starter/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  CACHE_SERVICE_TOKEN,
  type ICacheService,
} from '../../common/cache/cache.interface.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

/** 系统配置缓存 key 前缀（缓存管理页可按此 pattern 观察） */
export const SYSTEM_CONFIG_CACHE_PREFIX = 'sys:config:';
/** 配置缓存 TTL（秒）：30 分钟 */
const CONFIG_CACHE_TTL = 1800;

/** 公开配置白名单（默认拒绝，只显式列出可对外暴露的 key） */
export const PUBLIC_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'settings',
  'turnstile.config',
]);

/** 公开配置中需要脱敏的字段（key → 需脱敏的字段名集合；管理端/公开接口统一替换为占位符） */
const PUBLIC_CONFIG_SENSITIVE_FIELDS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  // turnstile.config：secretKey 脱敏为 ******，仅返回 enabled + siteKey
  ['turnstile.config', new Set(['secretKey'])],
  // storage.driver：云存储凭证 accessKey/secretKey 一律脱敏（本地模式无这些字段，不受影响）
  ['storage.driver', new Set(['accessKey', 'secretKey'])],
]);

/** 敏感字段脱敏占位符（前端约定：保存时仍为占位符则不提交该字段） */
export const MASK_PLACEHOLDER = '******';

/**
 * 对任意配置值按 key 做敏感字段脱敏（P1-3 修复：cache-admin 读取缓存原始值也用同一逻辑，
 * 避免 sys:config:* 缓存里的 secretKey/accessKey 经缓存管理页泄露）。
 * 非敏感 key / 非对象值原样返回。
 */
export function maskSensitiveValue(
  key: string,
  value: unknown,
): Record<string, unknown> {
  const sensitive = PUBLIC_CONFIG_SENSITIVE_FIELDS.get(key);
  if (
    !sensitive ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return (value ?? {}) as Record<string, unknown>;
  }
  const masked = { ...(value as Record<string, unknown>) };
  for (const field of sensitive) {
    if (masked[field] !== undefined) {
      masked[field] = MASK_PLACEHOLDER;
    }
  }
  return masked;
}

/** Prisma SystemConfig 行 → 契约 SystemConfig */
function toSystemConfig(row: {
  id: string;
  key: string;
  value: unknown;
  remark: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SystemConfig {
  return {
    id: row.id,
    key: row.key,
    value: (row.value ?? {}) as Record<string, unknown>,
    remark: row.remark,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 系统配置服务（system_config 表，key-value JSON）
 * - 列表查询（排除软删除） / 按 key 查询（cache-aside：Redis 优先，miss 回填 DB）
 * - 单条/批量更新（写后失效缓存 + 写审计 config_updated）
 * - publicConfigs 白名单 + 字段级脱敏（secret 绝不外泄）
 */
@Injectable()
export class SystemConfigService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    private readonly audit: AuditService,
  ) {}

  /** 全部未删除配置（管理端列表；敏感字段脱敏为占位符） */
  async list(): Promise<SystemConfig[]> {
    const rows = await this.prisma.client.systemConfig.findMany({
      where: { deletedAt: null },
      orderBy: { key: 'asc' },
    });
    return rows.map((row) => this.maskSensitive(toSystemConfig(row)));
  }

  /** 按 key 查配置（管理端读取，敏感字段脱敏为占位符；不存在返回 null） */
  async getByKey(key: string): Promise<SystemConfig | null> {
    const row = await this.findByKey(key);
    return row ? this.maskSensitive(toSystemConfig(row)) : null;
  }

  /** 内部原始读取（业务方用，如 turnstile.verify / 存储驱动；不脱敏，保证服务端拿到真值） */
  private async findByKey(key: string): Promise<{
    id: string;
    key: string;
    value: unknown;
    remark: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    return this.prisma.client.systemConfig.findFirst({
      where: { key, deletedAt: null },
    });
  }

  /**
   * 读取配置值并解析（缓存优先，业务方用，如 turnstile.verify）
   * @returns JSON 对象；不存在返回 null
   */
  async getValue<T extends Record<string, unknown>>(
    key: string,
  ): Promise<T | null> {
    const cacheKey = `${SYSTEM_CONFIG_CACHE_PREFIX}${key}`;
    const cached = await this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }
    const config = await this.findByKey(key);
    if (!config) {
      return null;
    }
    const value = config.value as T;
    // 回填缓存（写操作会失效，读缓存 30 分钟）
    await this.cache.set(cacheKey, value, CONFIG_CACHE_TTL);
    return value;
  }

  /** 公开配置列表（白名单 + 字段级脱敏；登录页等无需鉴权场景用） */
  async listPublic(): Promise<SystemConfig[]> {
    const rows = await this.prisma.client.systemConfig.findMany({
      where: { key: { in: [...PUBLIC_CONFIG_KEYS] }, deletedAt: null },
      orderBy: { key: 'asc' },
    });
    return rows.map((row) => this.maskSensitive(toSystemConfig(row)));
  }

  /** 敏感字段脱敏：按 key 剔除/替换 value 中的敏感字段（如 turnstile.config 的 secretKey） */
  private maskSensitive(config: SystemConfig): SystemConfig {
    const value = maskSensitiveValue(config.key, config.value);
    return { ...config, value };
  }

  /** 单条更新（UPSERT；写后失效缓存 + 审计；返回脱敏值，避免回显真密钥） */
  async update(
    key: string,
    input: unknown,
    operatorId: string,
  ): Promise<SystemConfig> {
    const data = UpdateConfigSchema.parse(input);
    const config = await this.upsertConfig(key, data.value, operatorId);
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.CONFIG_UPDATED,
      resourceId: config.id,
      detail: { key },
    });
    return this.maskSensitive(config);
  }

  /** 批量更新（一次校验全部 value 必须 JSON 对象，再逐个 upsert；写后失效缓存 + 单条审计） */
  async batchUpdate(
    input: unknown,
    operatorId: string,
  ): Promise<SystemConfig[]> {
    const data = BatchUpdateConfigsSchema.parse(input);
    const results: SystemConfig[] = [];
    for (const item of data.updates) {
      const config = await this.upsertConfig(item.key, item.value, operatorId);
      await this.audit.write({
        accountId: operatorId,
        action: AUDIT_ACTIONS.CONFIG_UPDATED,
        resourceId: config.id,
        detail: { key: item.key },
      });
      results.push(this.maskSensitive(config));
    }
    return results;
  }

  /** 删除配置（软删除；失效缓存；权限 config:admin:delete） */
  async remove(key: string, operatorId: string): Promise<{ success: true }> {
    const existing = await this.prisma.client.systemConfig.findFirst({
      where: { key, deletedAt: null },
    });
    if (!existing) {
      throw new BizException({
        code: 'CONFIG_NOT_FOUND',
        message: '配置不存在',
      });
    }
    await this.prisma.client.systemConfig.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await this.cache.del(`${SYSTEM_CONFIG_CACHE_PREFIX}${key}`);
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.CONFIG_UPDATED,
      resourceId: existing.id,
      detail: { key, deleted: true },
    });
    return { success: true };
  }

  /** 内部：upsert 配置行 + 失效缓存（软删行复用：清 deletedAt + 覆盖 value，key 保持唯一可重建） */
  private async upsertConfig(
    key: string,
    value: Record<string, unknown>,
    operatorId: string,
  ): Promise<SystemConfig> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new BizException({
        code: 'CONFIG_VALUE_INVALID',
        message: '配置值必须是 JSON 对象',
      });
    }
    // 先找未删行；不存在则找已软删行（key 唯一约束，软删后重建需复用并清除 deletedAt）
    const existing =
      (await this.prisma.client.systemConfig.findFirst({
        where: { key, deletedAt: null },
      })) ??
      // SystemConfig 已在 SOFT_DELETE_MODELS，client 会自动过滤 deletedAt=null，
      // 查「含已软删行」必须走 rawClient（无软删过滤），否则软删行无法被复用重建
      (await this.prisma.rawClient.systemConfig.findFirst({ where: { key } }));
    // 敏感字段占位符兜底：前端回传 ****** 时不覆盖真值（保留数据库旧值；无旧值则剔除该字段）
    const mergedValue = this.mergeSensitivePlaceholders(
      key,
      value,
      existing?.value,
    );
    const row = existing
      ? await this.prisma.client.systemConfig.update({
          where: { id: existing.id },
          data: {
            value: mergedValue as never,
            updatedBy: operatorId,
            deletedAt: null,
          },
        })
      : await this.prisma.client.systemConfig.create({
          data: {
            id: newId(),
            key,
            value: mergedValue as never,
            remark: null,
            updatedBy: operatorId,
          },
        });
    await this.cache.del(`${SYSTEM_CONFIG_CACHE_PREFIX}${key}`);
    return toSystemConfig(row);
  }

  /** 敏感字段占位符合并：value 中 === MASK_PLACEHOLDER 的字段保留数据库旧值（无旧值则剔除），防占位符覆盖真值 */
  private mergeSensitivePlaceholders(
    key: string,
    value: Record<string, unknown>,
    oldValue: unknown,
  ): Record<string, unknown> {
    const sensitive = PUBLIC_CONFIG_SENSITIVE_FIELDS.get(key);
    if (!sensitive) {
      return value;
    }
    const merged = { ...value };
    const old = (oldValue ?? {}) as Record<string, unknown>;
    for (const field of sensitive) {
      if (merged[field] === MASK_PLACEHOLDER) {
        if (old[field] !== undefined) {
          merged[field] = old[field];
        } else {
          delete merged[field];
        }
      }
    }
    return merged;
  }
}
