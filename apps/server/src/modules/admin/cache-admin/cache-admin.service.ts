/**
 * 缓存管理 Service
 *
 * 职责：
 * - 包装 CacheService，对外暴露"管理后台"语义的方法
 * - 统一错误处理：Redis 不可用 / 内存模式降级时返回可观测的安全值
 * - 提供 listKeys / getValue / delete / deleteByPattern / getStats 5 个管理操作
 *
 * 与 CacheService 的关系：
 * - CacheService 是"业务侧 API"（get/set/del，关心 KV 语义）
 * - CacheAdminService 是"运维侧 API"（SCAN、TTL 检查、批量删除，关心"现在缓存里有什么"）
 * - 二者共用底层的 CacheService 编排层
 *
 * 注意事项：
 * - SCAN 命令必须带 MATCH pattern + COUNT 限制，禁止用 KEYS *（生产事故）
 * - 所有方法都不抛 Redis 底层错误（已在 CacheService.backend.safe 兜底）
 * - 内存模式下 scanKeys 走 Map 遍历，pattern 用正则匹配
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { inspect } from 'node:util';
import { CACHE_SERVICE_TOKEN } from '../../../common/cache/cache.interface.js';
import type { ICacheService } from '../../../common/cache/cache.interface.js';
import type { CacheKey, DeleteCacheKeysResult } from './cache-admin.type.js';

/** 单页最大 key 数（防止 OOM） */
const MAX_KEYS_PER_PAGE = 500;

@Injectable()
export class CacheAdminService {
    private readonly logger = new Logger(CacheAdminService.name);

    constructor(@Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService) {}

    /**
     * 按 pattern 列出缓存 key（分页）
     *
     * 流程：
     *   1. 用 scanKeys 拿到所有匹配的 key（去重）
     *   2. 截取 [offset, offset+limit) 区间
     *   3. 对每个 key 并发查 type / ttl / value，组装成 CacheKey
     *
     * @param pattern  Redis MATCH 模式，如 'mono:auth:*' / '*' / 'mono:user:1'
     * @param offset   跳过前 N 个 key（分页用）
     * @param limit    返回多少条（最大 500）
     * @returns        当前页的 key 列表 + total（去重后总数）
     */
    async listKeys(pattern: string, offset: number, limit: number): Promise<{ items: CacheKey[]; total: number }> {
        // 防越界：limit 上限 + offset 兜底
        const safeLimit = Math.min(Math.max(limit, 1), MAX_KEYS_PER_PAGE);
        const safeOffset = Math.max(offset, 0);

        // SCAN 所有匹配 key（去重 — scanKeys 内部已去重）
        const allKeys = await this.cache.scanKeys(pattern || '*');
        const total = allKeys.length;

        const pageKeys = allKeys.slice(safeOffset, safeOffset + safeLimit);

        // 并发查每条 key 的元信息
        const items = await Promise.all(
            pageKeys.map(async (key) => {
                const [type, ttl, rawValue] = await Promise.all([
                    this.cache.getKeyType(key),
                    this.cache.ttl(key),
                    this.cache.get<unknown>(key),
                ]);

                // value 统一序列化为字符串：JSON 对象 → JSON 字符串；原始字符串 → 原值；null → null
                let valueStr: string | null = null;
                if (rawValue !== null && rawValue !== undefined) {
                    if (typeof rawValue === 'string') {
                        valueStr = rawValue;
                    } else {
                        try {
                            valueStr = JSON.stringify(rawValue);
                        } catch {
                            // 不可序列化（如循环引用），用 util.inspect 降级展示
                            valueStr = inspect(rawValue, { depth: 2, breakLength: 120 });
                        }
                    }
                }

                return {
                    key,
                    type,
                    ttl,
                    value: valueStr,
                    // size：仅作 UI 展示的"占用大小"提示（字符串 length，非真实字节数）
                    size: valueStr ? valueStr.length : 0,
                };
            }),
        );

        return { items, total };
    }

    /**
     * 查询单个 key 的完整信息
     *
     * @param key 完整 key 字符串
     * @returns   CacheKey；key 不存在时 value=null, ttl=-2
     */
    async getValue(key: string): Promise<CacheKey> {
        const [type, ttl, rawValue] = await Promise.all([
            this.cache.getKeyType(key),
            this.cache.ttl(key),
            this.cache.get<unknown>(key),
        ]);

        let valueStr: string | null = null;
        if (rawValue !== null && rawValue !== undefined) {
            if (typeof rawValue === 'string') {
                valueStr = rawValue;
            } else {
                try {
                    valueStr = JSON.stringify(rawValue);
                } catch {
                    // 不可序列化（如循环引用），用 util.inspect 降级展示
                    valueStr = inspect(rawValue, { depth: 2, breakLength: 120 });
                }
            }
        }

        return {
            key,
            type,
            ttl,
            value: valueStr,
            size: valueStr ? valueStr.length : 0,
        };
    }

    /**
     * 删除单个 key
     *
     * @returns true = 已删除；false = key 不存在
     */
    async deleteOne(key: string): Promise<boolean> {
        const exists = await this.cache.exists(key);
        if (!exists) return false;
        await this.cache.del(key);
        return true;
    }

    /**
     * 批量删除多个 key
     *
     * @param keys 要删除的 key 列表
     * @returns    实际删除的 key 数量 + 成功删除的 key 列表
     *
     * 设计：
     * - 传空数组 → 立即返回 { deletedCount: 0, keys: [] }，不调后端
     * - 先校验 key 是否存在再删除，避免对不存在的 key 报"成功删除"假象
     *   （Redis del 对不存在的 key 也会返回 1，所以前端需要二次校验）
     */
    async deleteMany(keys: string[]): Promise<DeleteCacheKeysResult> {
        if (keys.length === 0) {
            return { deletedCount: 0, keys: [] };
        }

        const deletedKeys: string[] = [];
        for (const key of keys) {
            const ok = await this.deleteOne(key);
            if (ok) deletedKeys.push(key);
        }

        return {
            deletedCount: deletedKeys.length,
            keys: deletedKeys,
        };
    }

    /**
     * 按 pattern 批量删除（SCAN + DEL）
     *
     * @param pattern Redis MATCH 模式
     * @returns       实际删除的 key 数量
     *
     * 安全：
     * - 内部用 SCAN（非 KEYS *），不会阻塞 Redis 主线程
     * - 真正危险的是 pattern='*'，会清空整个 db — 已在 Resolver 层用正则校验拦截
     */
    async deleteByPattern(pattern: string): Promise<{ deletedCount: number }> {
        const before = (await this.cache.scanKeys(pattern)).length;
        await this.cache.delByPattern(pattern);
        return { deletedCount: before };
    }

    /**
     * 获取缓存服务运行统计（透传到 CacheService.getStats）
     */
    async getStats() {
        return this.cache.getStats();
    }
}
