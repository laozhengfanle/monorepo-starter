/**
 * 缓存管理控制器
 *
 * 提供管理端缓存查看和清除功能：
 *   GET  /admin/cache/stats     — 缓存统计信息 + key 列表（过滤敏感 key）
 *   DELETE /admin/cache/keys    — 清除全部缓存
 *   DELETE /admin/cache/keys/:key — 清除指定缓存 key（校验 key 格式）
 *
 * 安全措施：
 *   - key 格式校验：只允许删除以 mono: 开头的缓存键，防止越权操作
 *   - 敏感 key 过滤：stats 接口不返回鉴权相关缓存键（mono:auth:*）
 *   - 使用 SCAN（而非 KEYS *）遍历 Redis，生产安全
 */
import { Controller, Delete, Get, Param, Logger, Inject, BadRequestException } from '@nestjs/common';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { CACHE_SERVICE_TOKEN } from '../../../common/cache/cache.interface.js';
import type { ICacheService } from '../../../common/cache/cache.interface.js';
import { SENSITIVE_KEY_PREFIXES } from '../../../common/cache/cache-key.constants.js';

/** 缓存 key 行（返回给前端） */
interface CacheKeyRow {
    key: string;
    /** Redis TYPE 命令返回的 key 类型：string / hash / list / set / zset / stream / none */
    type: string;
    /** 剩余 TTL（秒），-1 表示永不过期，-2 表示 key 不存在 */
    ttl: number;
    /** 序列化后体积（人类可读，如 "1.23 KB"） */
    size: string;
}

/** 缓存统计（返回给前端） */
interface CacheStats {
    totalKeys: number;
    usedMemory: string;
    hitRate: string;
    uptime: string;
}

/**
 * 允许操作的缓存 key 前缀（白名单）
 * - 集中定义在 cache-key.constants.ts 的 *PREFIX 形常量上
 * - 这里仅引用"根前缀"用于快速前置校验
 */
const ALLOWED_KEY_PREFIX = 'mono:';

@Controller('admin/cache')
@RequireAuth()
@Permission('config:cache:view')
export class CacheController {
    private readonly logger = new Logger(CacheController.name);

    constructor(@Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService) {}

    /**
     * 获取缓存统计 + key 列表
     * - 使用 SCAN 遍历所有 key（生产安全，不用 KEYS *）
     * - 内存缓存模式直接遍历 Map
     * - 敏感 key（鉴权缓存）不在列表中展示详情，仅计入统计数量
     * - stats 字段从 Redis INFO 获取（内存模式返回 "-"）
     * - 每行 key 的 type 字段从 Redis TYPE 命令获取
     */
    @Get('stats')
    async getStats(): Promise<{ code: number; message: string; data: { stats: CacheStats; keys: CacheKeyRow[] } }> {
        try {
            const allKeys = await this.scanAllKeys();
            const keyRows: CacheKeyRow[] = [];

            // 统计敏感 key 数量（不展示详情）
            let sensitiveCount = 0;

            for (const key of allKeys) {
                // 敏感 key 仅计数，不返回详情
                if (this.isSensitiveKey(key)) {
                    sensitiveCount++;
                    continue;
                }

                // 先获取 key 类型，再按类型决定如何读取
                // GET 命令只能读 string，hash/list/set/zset/stream 会抛 WRONGTYPE
                const type = await this.cacheService.getKeyType(key);
                const [ttl, val] = await Promise.all([
                    this.cacheService.ttl(key),
                    type === 'string' ? this.cacheService.get(key) : Promise.resolve(null),
                ]);
                // 尝试获取 value 大小（简化：取序列化后的长度）；非 string 类型不取 value
                const size = val !== null ? new Blob([JSON.stringify(val)]).size : 0;
                keyRows.push({
                    key,
                    type,
                    ttl: ttl === -1 ? -1 : ttl, // -1 = 永不过期, -2 = 已不存在
                    size: this.formatBytes(size),
                });
            }

            // 从缓存服务取真实运行统计（Redis INFO / 内存模式 fallback）
            const serviceStats = await this.cacheService.getStats();
            const stats: CacheStats = {
                totalKeys: allKeys.length,
                usedMemory: serviceStats.usedMemory,
                hitRate: serviceStats.hitRate,
                uptime: serviceStats.uptime,
            };

            // 如果有敏感 key 被过滤，在日志中记录
            if (sensitiveCount > 0) {
                this.logger.debug(`过滤了 ${sensitiveCount} 个敏感缓存 key（鉴权/配置相关）`);
            }

            return {
                code: 0,
                message: 'ok',
                data: { stats, keys: keyRows },
            };
        } catch (err) {
            this.logger.error('获取缓存统计失败', err);
            throw new BadRequestException(`获取缓存统计失败: ${(err as Error).message}`);
        }
    }

    /**
     * 清除全部缓存
     * - 需要config:cache:delete权限
     */
    @Delete('keys')
    @Permission('config:cache:delete')
    async clearAll(): Promise<{ code: number; message: string }> {
        const keys = await this.scanAllKeys();
        if (keys.length > 0) {
            await this.cacheService.delMany(keys);
        }
        this.logger.log(`清除了 ${keys.length} 个缓存 key`);
        return { code: 0, message: 'ok' };
    }

    /**
     * 清除指定缓存 key
     * - 需要config:cache:delete权限
     * - key 格式校验：只允许删除以 mono: 开头的缓存键
     * - 防止越权删除非本系统管理的缓存
     */
    @Delete('keys/:key')
    @Permission('config:cache:delete')
    async clearKey(@Param('key') key: string): Promise<{ code: number; message: string }> {
        // key 格式校验：只允许删除以 mono: 开头的缓存键
        if (!key.startsWith(ALLOWED_KEY_PREFIX)) {
            throw new BadRequestException(`仅允许删除以 "${ALLOWED_KEY_PREFIX}" 开头的缓存键`);
        }

        // 额外校验：key 不含路径遍历字符
        if (key.includes('..') || key.includes('/') || key.includes('\\')) {
            throw new BadRequestException('缓存键包含非法字符');
        }

        await this.cacheService.del(key);
        this.logger.log(`清除了缓存 key: ${key}`);
        return { code: 0, message: 'ok' };
    }

    /**
     * SCAN 遍历所有 mono: 前缀的 key
     * - 走 ICacheService 公开的 scanKeys 方法（编排层转发到对应后端）
     * - 内存模式：MemoryCacheBackend 内部遍历 Map + 正则
     * - Redis 模式：RedisCacheBackend 内部用 SCAN 游标分批（生产安全，不用 KEYS *）
     */
    private async scanAllKeys(): Promise<string[]> {
        return this.cacheService.scanKeys('mono:*', 100);
    }

    /** 判断是否为敏感缓存 key（鉴权/配置相关，不应在列表中暴露详情） */
    private isSensitiveKey(key: string): boolean {
        return SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
    }

    /** 格式化字节数 */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
