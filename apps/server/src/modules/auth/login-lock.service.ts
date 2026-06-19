import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
import { CACHE_KEYS } from '../../common/cache/cache-key.constants.js';
import { SystemConfigService } from '../admin/system-config/system-config.service.js';
import { RedisDegradationService } from '../../common/services/redis-degradation.service.js';

/**
 * 登录失败锁定服务
 * - 账号失败计数：mono:lock:login:{accountId} → INT, TTL 15min
 * - IP 失败计数：mono:lock:login:ip:{ip} → INT, TTL 15min
 * - 同一账号 5 次失败 → 锁定 15 分钟
 * - 同一 IP 50 次/小时 → 锁定
 * - Phase 8 集成 Turnstile 后升级：5 次失败 → 触发人机验证
 *
 * 配置来源（优先级从高到低）：
 * 1. system_config 表 key="settings" 中的 loginFailThreshold / lockDuration
 * 2. 环境变量 auth.THROTTLE_LOGIN_LIMIT / auth.THROTTLE_LOGIN_TTL（回退）
 * 3. 硬编码默认值（5 次 / 900 秒）
 *
 * Lua 原子脚本解决 incr + setex 竞态：
 * - 如果 key 不存在，SET key 1 EX ttl NX + return 1
 * - 如果 key 存在，INCR key + return 新值
 * - 保证 key 诞生时一定带 TTL，不会因崩溃导致永久锁定
 */
@Injectable()
export class LoginLockService {
    private readonly logger = new Logger(LoginLockService.name);

    /** IP 锁定阈值（从环境变量读取，回退默认值 50） */
    private readonly ipLockThreshold: number;
    /** 环境变量回退：账号锁定阈值 */
    private readonly envAccountLockThreshold: number;
    /** 环境变量回退：锁定窗口（秒） */
    private readonly envLockTtl: number;

    /**
     * Lua 脚本：原子递增 + 首次设置 TTL
     * KEYS[1] = 计数器 key
     * ARGV[1] = TTL（秒）
     * 返回：递增后的计数值
     */
    static readonly INCR_WITH_TTL_LUA = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
            redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return current
    `;

    constructor(
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly configService: ConfigService,
        private readonly systemConfigService: SystemConfigService,
        private readonly redisDegradation: RedisDegradationService,
    ) {
        // 环境变量回退值（system_config 读取失败时使用）
        this.envAccountLockThreshold = Number(this.configService.get<string>('auth.THROTTLE_LOGIN_LIMIT')) || 5;
        this.ipLockThreshold = Number(this.configService.get<string>('auth.THROTTLE_IP_LIMIT')) || 50;
        this.envLockTtl = Number(this.configService.get<string>('auth.THROTTLE_LOGIN_TTL')) || 900;
    }

    /**
     * 从 system_config 动态读取账号锁定阈值
     * - 优先读取 DB 配置（管理员可在设置页实时调整）
     * - 读取失败时回退到环境变量 / 默认值
     */
    private async getAccountLockThreshold(): Promise<number> {
        try {
            const config = await this.systemConfigService.findByKey('settings');
            const value = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
            const threshold = value?.loginFailThreshold;
            if (typeof threshold === 'number' && threshold > 0) return threshold;
        } catch {
            // 配置不存在或缓存异常 → 回退
        }
        return this.envAccountLockThreshold;
    }

    /**
     * 从 system_config 动态读取锁定时长（秒）
     * - 优先读取 DB 配置（管理员可在设置页实时调整）
     * - 读取失败时回退到环境变量 / 默认值
     */
    private async getLockTtl(): Promise<number> {
        try {
            const config = await this.systemConfigService.findByKey('settings');
            const value = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
            const lockDuration = value?.lockDuration;
            // DB 存的是分钟，需转换为秒
            if (typeof lockDuration === 'number' && lockDuration > 0) return lockDuration * 60;
        } catch {
            // 配置不存在或缓存异常 → 回退
        }
        return this.envLockTtl;
    }

    /**
     * 获取锁定时长（分钟），供 AuthService 生成用户提示用
     * - 优先从 DB 配置读取
     * - 回退到环境变量 / 默认值（900 秒 = 15 分钟）
     */
    async getLockDurationMinutes(): Promise<number> {
        const ttlSeconds = await this.getLockTtl();
        return Math.ceil(ttlSeconds / 60);
    }

    /**
     * 记录登录失败（原子操作）
     * - 使用 Lua 脚本保证 INCR + EXPIRE 原子性
     * - 同时递增账号和 IP 的失败计数
     * - 返回是否已锁定
     *
     * Redis 故障时降级为"不锁定"
     * - tryWithFallback：Redis 抛错时 fallback 返回 0（视为没失败）
     * - 安全权衡：Redis 挂掉期间不锁账户 → 攻击者会利用？答案是：Redis 挂掉时所有认证服务都不可用
     *   攻击者连登录都做不到，所以 fail-open 是更安全的选择
     */
    async recordFailure(accountId: string, ip: string): Promise<{ locked: boolean }> {
        const accountKey = `${CACHE_KEYS.LOGIN_LOCK}:${accountId}`;
        const ipKey = `${CACHE_KEYS.LOGIN_LOCK}:ip:${ip}`;

        // 动态读取配置
        const [accountLockThreshold, lockTtl] = await Promise.all([this.getAccountLockThreshold(), this.getLockTtl()]);

        /**
         * 原子递增账号失败计数（走 Redis 降级）
         * - Redis 正常 → 返回真实计数值
         * - Redis 故障 → 降级为 0（不增加计数，登录继续）
         */
        const accountCount = await this.redisDegradation.tryWithFallback(
            async () =>
                Number(
                    await this.cacheService.evalLua(LoginLockService.INCR_WITH_TTL_LUA, [accountKey], [lockTtl], () =>
                        this.memoryIncrWithTtl(accountKey, lockTtl),
                    ),
                ),
            async () => {
                this.logger.warn(`recordFailure Redis 故障降级（不增加计数）: accountId=${accountId}`);
                return 0;
            },
        );

        /** 原子递增 IP 失败计数（走 Redis 降级） */
        const ipCount = await this.redisDegradation.tryWithFallback(
            async () =>
                Number(
                    await this.cacheService.evalLua(LoginLockService.INCR_WITH_TTL_LUA, [ipKey], [lockTtl], () =>
                        this.memoryIncrWithTtl(ipKey, lockTtl),
                    ),
                ),
            async () => {
                this.logger.warn(`recordFailure Redis 故障降级（不增加 IP 计数）: ip=${ip}`);
                return 0;
            },
        );

        /** 检查是否达到锁定阈值 */
        const locked = accountCount >= accountLockThreshold || ipCount >= this.ipLockThreshold;

        if (locked) {
            this.logger.warn(
                `登录锁定触发: accountId=${accountId}, accountCount=${accountCount}, ip=${ip}, ipCount=${ipCount}`,
            );
        }

        return { locked };
    }

    /**
     * 检查是否已锁定
     * - 账号或 IP 任一达到阈值即视为锁定
     * - Redis 故障时降级为 false（不视为锁定）+ warn
     */
    async isLocked(accountId: string, ip: string): Promise<boolean> {
        const accountKey = `${CACHE_KEYS.LOGIN_LOCK}:${accountId}`;
        const ipKey = `${CACHE_KEYS.LOGIN_LOCK}:ip:${ip}`;

        // 动态读取阈值
        const accountLockThreshold = await this.getAccountLockThreshold();

        /** 走 Redis 降级 — 失败时 fallback 返回 0 */
        const accountCount = await this.redisDegradation.safeGet<number>(accountKey, 0);
        const ipCount = await this.redisDegradation.safeGet<number>(ipKey, 0);

        return (accountCount ?? 0) >= accountLockThreshold || (ipCount ?? 0) >= this.ipLockThreshold;
    }

    /**
     * 登录成功后重置失败计数
     * - 只重置账号级别，IP 级别不重置（防止攻击者通过成功登录重置 IP 计数）
     */
    async resetOnSuccess(accountId: string): Promise<void> {
        const accountKey = `${CACHE_KEYS.LOGIN_LOCK}:${accountId}`;
        await this.cacheService.del(accountKey);
    }

    /**
     * 清空指定账号的失败计数
     * - 场景：管理员强制改密后，被锁账号应能立即重试
     * - 场景：用户重置密码成功后，期望失败计数从 0 开始
     * - 复用 resetOnSuccess 的语义（都是清账号级计数）
     *
     * 与 resetOnSuccess 的区别：
     * - resetOnSuccess：登录成功后自动调用（auth.service.ts#adminLogin）
     * - clear：外部主动调用（changePassword、adminAccountService#restore）
     *
     * @param accountId 账户 ID
     */
    async clear(accountId: string): Promise<void> {
        const accountKey = `${CACHE_KEYS.LOGIN_LOCK}:${accountId}`;
        await this.cacheService.del(accountKey);
        this.logger.log(`LoginLock cleared: accountId=${accountId}`);
    }

    /**
     * 内存模式 fallback：递增 + 首次设置 TTL
     * - 内存模式本身不存在竞态（单线程），但保持与 Lua 一致的语义
     */
    private async memoryIncrWithTtl(key: string, ttl: number): Promise<number> {
        const entry = await this.cacheService.get<number>(key);
        const current = (entry ?? 0) + 1;
        await this.cacheService.setex(key, ttl, current);
        return current;
    }
}
