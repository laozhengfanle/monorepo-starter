import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
import { LoginLockService } from './login-lock.service.js';

/**
 * 登录锁定集成层
 *
 * 职责：
 * - 作为 LoginLockService 的薄包装，暴露给 AuthService 使用
 * - 当前为纯代理：所有方法直接转发到 LoginLockService
 * - 保留 ICacheService 注入位：
 *   1. 未来用于加本地短路缓存（高 QPS 场景下避免每次登录都打 Redis）
 *   2. 未来用于加监控埋点（命中率 / 锁定次数 / Redis 降级次数）
 *   3. 与 LoginLockService 解耦：AuthService 不直接感知底层实现
 *
 * 不负责：
 * - 任何业务逻辑（仅转发）
 * - 配置读取（由 LoginLockService 内部处理 system_config + 环境变量回退）
 * - 任何写操作以外的 Redis 操作（refuse / reset / clear 全部走 LoginLockService）
 *
 * 设计动机：
 * - AuthService 现在只依赖 LoginLockIntegration，不直接依赖 LoginLockService
 * - 未来要把锁定阈值改成动态下发、要做降级打点、要替换底层实现（Redis → 内存 → 第三方）
 *   只改 LoginLockIntegration 这一个文件即可，不用动 AuthService
 *
 * 流程：
 * - AuthService → LoginLockIntegration → LoginLockService → Redis
 * - 三层结构清晰，AuthService 只关心"是否锁定 / 记录失败 / 重置"，不关心底层存储
 */
@Injectable()
export class LoginLockIntegration {
    private readonly logger = new Logger(LoginLockIntegration.name);

    constructor(
        private readonly loginLockService: LoginLockService,
        // 暂未使用：保留注入位，便于未来在集成层做缓存/埋点

        @Inject(CACHE_SERVICE_TOKEN) private readonly _cacheService: ICacheService,
    ) {}

    /**
     * 检查账号或 IP 是否被锁定
     * - 走 LoginLockService.isLocked
     * - Redis 故障时降级为 false（不视为锁定）+ warn
     *
     * @param accountId 账户 ID
     * @param ip 客户端 IP
     * @returns true=已锁定，false=未锁定
     */
    async isLocked(accountId: string, ip: string): Promise<boolean> {
        return this.loginLockService.isLocked(accountId, ip);
    }

    /**
     * 记录登录失败（账号 + IP 双维度计数）
     * - 走 LoginLockService.recordFailure
     * - 返回是否触发锁定
     * - Redis 故障时降级为 locked=false（不增加计数，登录继续）
     *
     * @param accountId 账户 ID
     * @param ip 客户端 IP
     * @returns { locked: boolean } 是否本次触发锁定
     */
    async recordFailure(accountId: string, ip: string): Promise<{ locked: boolean }> {
        return this.loginLockService.recordFailure(accountId, ip);
    }

    /**
     * 登录成功后重置账号失败计数
     * - 只重置账号级别，IP 级别不重置（防攻击者通过成功登录重置 IP 计数）
     * - 走 LoginLockService.resetOnSuccess
     *
     * @param accountId 账户 ID
     */
    async resetOnSuccess(accountId: string): Promise<void> {
        await this.loginLockService.resetOnSuccess(accountId);
    }

    /**
     * 主动清空账号失败计数
     * - 场景：改密后 / 管理员重置后
     * - 走 LoginLockService.clear
     *
     * @param accountId 账户 ID
     */
    async clear(accountId: string): Promise<void> {
        await this.loginLockService.clear(accountId);
    }

    /**
     * 获取锁定时长（分钟），供前端提示用
     * - 走 LoginLockService.getLockDurationMinutes
     * - 优先从 system_config 读取，回退到环境变量 / 默认值
     *
     * @returns 锁定时长（分钟）
     */
    async getLockDurationMinutes(): Promise<number> {
        return this.loginLockService.getLockDurationMinutes();
    }
}
