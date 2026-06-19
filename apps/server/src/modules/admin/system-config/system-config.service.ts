/**
 * 系统配置服务
 *
 * 业务能力：
 * - 列表查询（返回全部配置项）
 * - 按 key 查询（cache-aside：优先 Redis，miss 时查 DB 回填）
 * - 创建 / 更新
 * - 软删除
 * - 缓存：写操作后失效缓存；读操作走 cache-aside
 *
 * 提供两套接口：
 * - 旧 SystemConfig：value 为 JSON 字符串（向后兼容老前端 / seed）
 * - 新 AdminConfig：value 为已解析的 JSON 对象，附完整管理字段（适配前端 e5b1fd8）
 *
 * 缓存的 SystemConfig 对象只包含 { key, value, updatedAt }，
 * 不包含 remark/updatedBy 等管理字段。
 *
 * 注意：DB schema（prisma）实际只有 id/key/value/remark/updatedBy/createdAt/updatedAt，
 *      没有 group/description/type 字段，所以这些字段在 service 中已移除。
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { newId } from '@packages/shared';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { Prisma, SystemConfig as SystemConfigModel } from '../../../../prisma/generated/client.js';
import { CACHE_KEYS } from '../../../common/cache/cache-key.constants.js';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../../common/cache/cache.interface.js';
import { Inject } from '@nestjs/common';
import { AuditService, AUDIT_ACTIONS } from '../../audit/audit.service.js';
import type { SystemConfig, AdminConfig } from './system-config.type.js';

/** turnstile.config 的 key 常量（与 TurnstileService 内部一致） */
const TURNSTILE_CONFIG_KEY = 'turnstile.config';

/** 系统配置缓存 TTL（秒）：30 分钟 */
const CONFIG_CACHE_TTL = 1800;

/**
 * 公开配置白名单
 *
 * 安全原则：默认拒绝，只显式列出可对外暴露的 key
 * - 当前公开：
 *   - settings（系统名/logo/footer，仅用于登录页/浏览器 title 等 UI 渲染）
 *   - turnstile.config（Cloudflare Turnstile 人机验证配置，**已脱敏 secretKey**）
 *     - 前端登录页需读取 enabled + siteKey 决定是否渲染 widget
 *     - secretKey 字段会在 findPublic() 中被剔除，绝不返回给前端
 * - 任何包含 clientSecret / appSecret / apiKey / token 等敏感字段的配置
 *   都**不能**加入此白名单，必须鉴权后由 privateConfigs 返回
 *
 * ⚠️ 修改此常量前请先确认：value 中是否含敏感字段
 */
export const PUBLIC_CONFIG_KEYS: ReadonlySet<string> = new Set(['settings', 'turnstile.config']);

/**
 * 公开配置中需要脱敏的字段（按 key 维度）
 * - key: config key
 * - value: 需要从 value 对象中剔除的字段名集合
 * - 注意：仅脱敏 value 内的敏感字段，**不**修改 key 本身
 */
const PUBLIC_CONFIG_SENSITIVE_FIELDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
    /** turnstile.config: 剔除 secretKey，仅返回 enabled + siteKey（前端渲染 widget 用） */
    ['turnstile.config', new Set(['secretKey'])],
]);

@Injectable()
export class SystemConfigService {
    private readonly logger = new Logger(SystemConfigService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly auditService: AuditService,
        private readonly moduleRef: ModuleRef,
    ) {}

    /**
     * 列表查询（返回全部未删除的配置项，按 key 升序）
     * 说明：原代码支持按 group 筛选，但 DB schema 中没有 group 字段，故移除。
     * 软删除：通过 deletedAt 字段过滤已删除的记录
     */
    async findAll(): Promise<SystemConfig[]> {
        // 过滤已软删除的记录
        const configs = await this.prisma.client.systemConfig.findMany({
            where: { deletedAt: null },
            orderBy: [{ key: 'asc' }],
        });
        return configs.map((c) => this.toSystemConfig(c));
    }

    /**
     * 管理端列表查询（新版 adminConfigs 接口使用）
     *
     * 与 findAll 区别：
     * - 包含完整管理字段（id / remark / updatedBy / createdAt）
     * - value 是已解析的 JSON 对象（不是字符串）
     * - 不走缓存：管理端低频写、高频读且结构变化多，避免缓存过期 / 不一致
     */
    async findAllAsAdmin(): Promise<AdminConfig[]> {
        const configs = await this.prisma.client.systemConfig.findMany({
            where: { deletedAt: null },
            orderBy: [{ key: 'asc' }],
        });
        return configs.map((c) => this.toAdminConfig(c));
    }

    /**
     * 公开配置查询（无需鉴权，供登录页/浏览器 title 等场景使用）
     *
     * 安全：仅返回 PUBLIC_CONFIG_KEYS 白名单内的 key
     * - 默认拒绝：白名单外的 key 一律不返回
     * - value 中含敏感字段（clientSecret/appSecret/secretKey/apiKey/token 等）的
     *   配置**绝不能**加入白名单
     * - 已在 PUBLIC_CONFIG_KEYS 中的配置，若 value 内仍含敏感字段（如 turnstile.config.secretKey），
     *   会在此方法内按 PUBLIC_CONFIG_SENSITIVE_FIELDS 二次脱敏后返回
     * - value 是已解析的 JSON 对象（与 AdminConfig 形状一致）
     *
     * 注意：当前是「同步过滤 + 字段级脱敏」
     * - 若 key 缺失/被软删，直接跳过（不报错）
     */
    async findPublic(): Promise<AdminConfig[]> {
        if (PUBLIC_CONFIG_KEYS.size === 0) return [];
        const configs = await this.prisma.client.systemConfig.findMany({
            where: {
                deletedAt: null,
                key: { in: Array.from(PUBLIC_CONFIG_KEYS) },
            },
            orderBy: [{ key: 'asc' }],
        });
        return configs.map((c) => this.maskPublicConfig(this.toAdminConfig(c)));
    }

    /**
     * 公开配置二次脱敏：按 PUBLIC_CONFIG_SENSITIVE_FIELDS 剔除敏感字段
     * - 当前只有 turnstile.config.secretKey 一项需要剔除
     * - 用 structuredClone 避免修改原 AdminConfig 对象（防上游引用被污染）
     * - 脱敏后的 value 是新对象，原值保持不变
     */
    private maskPublicConfig(config: AdminConfig): AdminConfig {
        const sensitiveFields = PUBLIC_CONFIG_SENSITIVE_FIELDS.get(config.key);
        if (!sensitiveFields || sensitiveFields.size === 0) {
            return config;
        }
        // 浅拷贝 value 即可（只删顶层字段，不递归）
        const maskedValue: Record<string, unknown> = { ...config.value };
        for (const field of sensitiveFields) {
            if (field in maskedValue) {
                delete maskedValue[field];
            }
        }
        return { ...config, value: maskedValue };
    }

    /**
     * 私有配置查询（需要 config:admin:list 权限）
     *
     * 与 findAllAsAdmin 区别：内部用，不暴露给 GraphQL
     * - 保留作为 service 内部一致性入口
     * - 实际暴露给前端的私有配置接口是 resolver.privateConfigs（@RequireAuth() + @Permission）
     */
    async findPrivate(): Promise<AdminConfig[]> {
        return this.findAllAsAdmin();
    }

    /**
     * 单条查询（cache-aside）
     * - 优先读 Redis mono:data:system_config:{key}
     * - miss 时查 DB → 写缓存（TTL 30 分钟）→ 返回
     * - key 不存在时抛 NotFoundException（不缓存 null）
     */
    async findByKey(key: string): Promise<SystemConfig> {
        const cacheKey = this.cacheKey(key);

        // 1. 尝试从缓存读取
        try {
            const cached = await this.cacheService.get<SystemConfig>(cacheKey);
            if (cached) {
                this.logger.debug(`Cache hit: ${cacheKey}`);
                return cached;
            }
        } catch (err) {
            // 缓存不可用时降级到 DB（不阻塞主流程）
            this.logger.warn(`Cache read failed for ${cacheKey}, falling back to DB`, err);
        }

        // 2. 缓存 miss → 查 DB
        const config = await this.prisma.client.systemConfig.findUnique({ where: { key } });
        if (!config) {
            throw new NotFoundException(`配置 ${key} 不存在`);
        }
        const result = this.toSystemConfig(config);

        // 3. 回填缓存（失败不影响返回）
        try {
            await this.cacheService.set(cacheKey, result, CONFIG_CACHE_TTL);
        } catch (err) {
            this.logger.warn(`Cache backfill failed for ${cacheKey}`, err);
        }

        return result;
    }

    /**
     * 按 key 查找配置（不抛异常，找不到返回 null）
     * - 返回 AdminConfig | null（含完整字段 id/key/value/remark/updatedBy/createdAt/updatedAt）
     * - 用于 myPreferences 等"配置不存在即跳过"的场景
     */
    async findByKeyOrNull(key: string): Promise<AdminConfig | null> {
        const config = await this.prisma.client.systemConfig.findUnique({ where: { key } });
        if (!config) return null;
        return this.toAdminConfig(config);
    }

    /**
     * 按 key 读取配置项的 value 字段（不抛异常，找不到返回 null）
     *
     * 用途：供后端内部 service（如 TurnstileService）读取 `turnstile.config`
     * 这种"运行时业务配置"，避免直接耦合 prisma.client。
     *
     * 与 findByKey 的差异：
     * - findByKey: 找不到抛 NotFoundException，调用方需 try/catch
     * - getConfigByKey: 找不到返回 null，方便业务侧做"配置缺失即跳过"逻辑
     *
     * useCache=true 时走 service 内置 Redis 缓存（30 分钟 TTL，写时失效）；
     * useCache=false 直接查 DB，用于"必须拿到最新值"的场景
     * （如 admin 端保存配置后立即验证）。
     *
     * @param key 配置 key（如 'turnstile.config'）
     * @param useCache 是否走 Redis 缓存，默认 true
     * @returns value 的原始内容（DB JSON 字段反序列化后的对象 / 字符串 / null）
     */
    async getConfigByKey(key: string, useCache = true): Promise<unknown> {
        // 1. 缓存路径：复用 findByKey 的 cache-aside 逻辑
        if (useCache) {
            const cacheKey = this.cacheKey(key);
            try {
                const cached = await this.cacheService.get<SystemConfig>(cacheKey);
                if (cached) {
                    return this.parseValueField(cached.value);
                }
            } catch (err) {
                this.logger.warn(`Cache read failed for ${cacheKey}, falling back to DB`, err);
            }
        }

        // 2. DB 查询：使用 findFirst 过滤软删除（findUnique 不支持 deletedAt 过滤）
        const config = await this.prisma.client.systemConfig.findFirst({
            where: { key, deletedAt: null },
        });
        if (!config) return null;

        return this.parseValueField(config.value);
    }

    /**
     * 解析 DB 中 JSON 字段为 JS 值
     * - DB 实际存的是 JSON 字段（Prisma 端类型 unknown）
     * - 可能是对象 / 数组 / 字符串 / 数字 / 布尔
     * - 若为字符串则尝试 JSON.parse（兼容历史数据可能存的 JSON 字符串）
     */
    private parseValueField(raw: unknown): unknown {
        if (raw === null || raw === undefined) return null;
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw);
            } catch {
                return raw;
            }
        }
        return raw;
    }

    /**
     * 创建配置
     * 说明：DB schema 没有 group/description/type 字段，所以 input 只剩 key/value
     */
    async create(input: { key: string; value: string }): Promise<SystemConfig> {
        const existing = await this.prisma.client.systemConfig.findUnique({ where: { key: input.key } });
        if (existing) {
            throw new BadRequestException({ code: 12001, message: `配置 ${input.key} 已存在` });
        }
        // 仅写入 DB 实际存在的字段
        const config = await this.prisma.client.systemConfig.create({
            data: { key: input.key, value: input.value } as Prisma.SystemConfigCreateInput,
        });
        /** 创建后预填缓存，避免后续首次查询穿透到 DB */
        const result = this.toSystemConfig(config);
        try {
            await this.cacheService.set(this.cacheKey(input.key), result, CONFIG_CACHE_TTL);
        } catch (err) {
            this.logger.warn(`Cache backfill failed for ${input.key}`, err);
        }
        return result;
    }

    /**
     * 更新配置（按 key）
     * - 先检查 key 是否存在，不存在则返回 404
     * - 更新后失效该 key 的 Redis 缓存
     *
     * 审计：使用细粒度 CONFIG_UPDATED，记录"谁改了哪个配置项、改成了什么"
     * 当前 method 是 upsert 语义（key 不存在会自动 insert），后续如需区分新建/更新，
     * 可在 service 上加 createdFlag 并对应扩展枚举
     */
    async update(key: string, input: { value: string }): Promise<SystemConfig> {
        // value 传输为 JSON 字符串，需 parse 为对象再存入 JSON 列
        let parsedValue: unknown = input.value;
        try {
            parsedValue = JSON.parse(input.value);
        } catch {
            /* keep as string */
        }
        const config = await this.prisma.client.systemConfig.upsert({
            where: { key },
            update: { value: parsedValue as Prisma.InputJsonValue },
            create: { id: newId(), key, value: parsedValue as Prisma.InputJsonValue },
        });
        /** 失效该 key 的缓存 */
        await this.cacheService.del(this.cacheKey(key));
        this.logger.log(`System config upserted: key=${key}`);

        /**
         * 写审计日志（统一使用 AuditService）
         * 使用细粒度 CONFIG_UPDATED：审计要能回答"谁在何时改了哪个系统配置"
         * 当前是 upsert 语义（同时覆盖 create/update），所以统一记为 updated
         * detail.value 记录新值（配置项通常不大，直接存）
         */
        await this.auditService.record({
            accountId: '',
            action: AUDIT_ACTIONS.CONFIG_UPDATED,
            resourceType: 'system_config',
            resourceId: key,
            detail: { value: parsedValue },
        });

        return this.toSystemConfig(config);
    }

    /**
     * 单条更新配置（新接口 updateConfig 使用）
     *
     * 与 update 区别：
     * - value 直接接收 JSON 对象（不再 JSON.parse 字符串）
     * - 写入失败抛 BadRequestException（用 Zod 在 resolver 层校验）
     * - 同样失效 Redis 缓存 + 写审计日志
     */
    async updateOne(key: string, value: unknown): Promise<AdminConfig> {
        // value 必须是对象（前端可能传 string / number / boolean，需拒绝）
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new BadRequestException({
                code: 12002,
                message: `配置 ${key} 的 value 必须是 JSON 对象`,
            });
        }
        const config = await this.prisma.client.systemConfig.upsert({
            where: { key },
            update: { value: value as Prisma.InputJsonValue },
            create: { id: newId(), key, value: value },
        });
        /** 失效该 key 的缓存 */
        await this.cacheService.del(this.cacheKey(key));
        this.logger.log(`Admin config upserted: key=${key}`);

        /** turnstile.config 更新后主动清除 TurnstileService 内存缓存，实现"保存即生效" */
        if (key === TURNSTILE_CONFIG_KEY) {
            // 异步操作，不阻塞当前请求；错误已在内部 try/catch 兜底
            void this.invalidateTurnstileConfigCache();
        }

        /** 写审计 */
        await this.auditService.record({
            accountId: '',
            action: AUDIT_ACTIONS.CONFIG_UPDATED,
            resourceType: 'system_config',
            resourceId: key,
            detail: { value },
        });

        return this.toAdminConfig(config);
    }

    /**
     * 批量更新配置（新接口 batchUpdateConfigs 使用）
     *
     * - 两阶段：
     *   1. 校验阶段：先遍历所有 item，校验 value 必须是对象（无副作用）
     *   2. 写入阶段：所有 item 校验通过后才逐个 upsert
     * - 这样可以保证"全部成功或全部不写"语义（不依赖 prisma 事务，避免跨多个 upsert 的事务复杂度）
     * - 任一 item 校验失败 → 抛 BadRequestException，已成功的项为 0
     * - 一次性失效所有受影响的 key 缓存
     * - 写一条聚合审计，detail.updates 列出每条改动
     *
     * @param updates 更新项列表，每项 { key, value }
     * @returns 更新后的全部配置项（与 updates 顺序一致）
     */
    async batchUpdate(updates: { key: string; value: unknown }[]): Promise<AdminConfig[]> {
        if (!updates || updates.length === 0) {
            throw new BadRequestException({ code: 12003, message: '批量更新至少 1 条' });
        }

        /** 阶段 1：全量校验（无副作用） */
        for (const { key, value } of updates) {
            // value 必须是对象（前端可能传 string / number / boolean / 数组 / null，需拒绝）
            if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                throw new BadRequestException({
                    code: 12002,
                    message: `配置 ${key} 的 value 必须是 JSON 对象`,
                });
            }
        }

        /** 阶段 2：全量写入 */
        const results: AdminConfig[] = [];
        const touchedKeys: string[] = [];

        for (const { key, value } of updates) {
            const config = await this.prisma.client.systemConfig.upsert({
                where: { key },
                update: { value: value as Prisma.InputJsonValue },
                create: { id: newId(), key, value: value as Prisma.InputJsonValue },
            });
            results.push(this.toAdminConfig(config));
            touchedKeys.push(key);
        }

        /** 一次性失效所有受影响的 key 缓存 */
        if (touchedKeys.length > 0) {
            try {
                await this.cacheService.delMany(touchedKeys.map((k) => this.cacheKey(k)));
            } catch (err) {
                this.logger.warn(`Batch cache invalidation failed for ${touchedKeys.length} keys`, err);
            }
        }
        this.logger.log(`Admin config batch upserted: ${touchedKeys.length} keys`);

        /** turnstile.config 更新后主动清除 TurnstileService 内存缓存，实现"保存即生效" */
        if (touchedKeys.includes(TURNSTILE_CONFIG_KEY)) {
            // 异步操作，不阻塞当前请求；错误已在内部 try/catch 兜底
            void this.invalidateTurnstileConfigCache();
        }

        /** 聚合审计：1 条记录包含所有改动 */
        await this.auditService.record({
            accountId: '',
            action: AUDIT_ACTIONS.CONFIG_UPDATED,
            resourceType: 'system_config',
            resourceId: touchedKeys.join(','),
            detail: { updates: updates.map((u) => ({ key: u.key, value: u.value })) },
        });

        return results;
    }

    /**
     * 软删除
     * - 先检查 key 是否存在，不存在则返回 404
     */
    async delete(key: string): Promise<{ key: string; deleted: true }> {
        /** 检查配置是否存在 */
        const existing = await this.prisma.client.systemConfig.findUnique({ where: { key } });
        if (!existing) {
            throw new NotFoundException(`配置 ${key} 不存在`);
        }

        await this.prisma.client.systemConfig.update({
            where: { key },
            data: { deletedAt: new Date() },
        });
        await this.cacheService.del(this.cacheKey(key));
        return { key, deleted: true };
    }

    /**
     * 生成缓存 key
     */
    private cacheKey(key: string): string {
        return `${CACHE_KEYS.SYSTEM_CONFIG}:${key}`;
    }

    /**
     * 主动清除 TurnstileService 的内存缓存（修复 admin 改完配置不立即生效的 bug）
     *
     * 使用动态 import 是为了避免 SystemConfig ⇄ Turnstile 之间的循环依赖：
     * TurnstileService 也 import 了本 service，所以静态 import 会让 Nest DI 在
     * 加载阶段就 stack overflow。动态 import 只在运行时按需加载。
     *
     * 调用时机：updateOne / batchUpdate 写入 turnstile.config 后。
     * 如果 TurnstileModule 尚未加载（理论上不会），get 会抛异常，catch 后静默忽略。
     */
    private async invalidateTurnstileConfigCache(): Promise<void> {
        try {
            // 动态 import：避免循环依赖（TurnstileService 也引入了本 service）
            const { TurnstileService } = await import('../../turnstile/turnstile.service.js');
            const turnstileService = this.moduleRef.get(TurnstileService, { strict: false });
            turnstileService?.clearConfigCache();
        } catch {
            // TurnstileModule 未加载时忽略（如测试环境）
        }
    }

    /**
     * 转换 Prisma → 旧 SystemConfig
     * 说明：DB 中没有 group/description/type 字段，所以转换时不再赋值这些字段
     */
    private toSystemConfig(c: SystemConfigModel): SystemConfig {
        const rawValue = c.value;
        // DB 中为 JSON 对象，GraphQL 声明为 String，需序列化
        const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
        return {
            key: c.key,
            value,
            updatedAt: c.updatedAt,
        };
    }

    /**
     * 转换 Prisma → 新 AdminConfig
     *
     * - 完整字段映射
     * - value 解析为对象（解析失败时降级为空对象，避免前端崩溃）
     */
    private toAdminConfig(c: SystemConfigModel): AdminConfig {
        const rawValue = c.value;
        let value: Record<string, unknown> = {};
        if (rawValue !== null && rawValue !== undefined) {
            if (typeof rawValue === 'string') {
                try {
                    const parsed = JSON.parse(rawValue);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        value = parsed as Record<string, unknown>;
                    }
                } catch {
                    /* 解析失败：保持空对象 */
                }
            } else if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
                value = rawValue;
            }
        }
        return {
            id: c.id,
            key: c.key,
            value,
            remark: c.remark ?? null,
            updatedBy: c.updatedBy ?? null,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        };
    }
}
