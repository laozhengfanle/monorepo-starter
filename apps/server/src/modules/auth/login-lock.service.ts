import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CACHE_SERVICE_TOKEN,
  type ICacheService,
} from '../../common/cache/cache.interface.js';
import { BusinessMetrics } from '../../common/metrics/business.metrics.js';
import { SystemConfigService } from '../system-config/system-config.service.js';

/** 登录锁定默认配置：5 次失败 / 15 分钟窗口 / 同 IP 50 次 */
const DEFAULT_ACCOUNT_THRESHOLD = 5;
const DEFAULT_IP_THRESHOLD = 50;
const DEFAULT_LOCK_TTL = 15 * 60;
/** system_config settings 里登录失败阈值的 key */
const SETTINGS_KEY = 'settings';

/**
 * 登录失败锁定：
 * - 账号失败计数：auth:lock:{accountId}（N 次/15min → 锁定）
 * - IP 失败计数：auth:lock:ip:{ip}（50 次/15min → 锁定）
 * - 账号阈值优先读 system_config settings.loginFailThreshold（后台设置可配），
 *   未配置时回退环境变量 LOGIN_LOCK_ACCOUNT_THRESHOLD（默认 5）
 * - 成功登录时清零；失败时可通过 getRemainingAttempts 取剩余次数（登录框提示）
 */
@Injectable()
export class LoginLockService {
  private readonly ipThreshold: number;
  private readonly lockTtl: number;
  private readonly envAccountThreshold: number;

  constructor(
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    configService: ConfigService,
    private readonly systemConfig: SystemConfigService,
    private readonly metrics: BusinessMetrics,
  ) {
    this.envAccountThreshold =
      Number(configService.get<string>('LOGIN_LOCK_ACCOUNT_THRESHOLD')) ||
      DEFAULT_ACCOUNT_THRESHOLD;
    this.ipThreshold =
      Number(configService.get<string>('LOGIN_LOCK_IP_THRESHOLD')) ||
      DEFAULT_IP_THRESHOLD;
    this.lockTtl =
      Number(configService.get<string>('LOGIN_LOCK_TTL')) || DEFAULT_LOCK_TTL;
  }

  /** 当前账号失败阈值（后台设置 settings.loginFailThreshold 优先，回退环境变量/默认值） */
  async getAccountThreshold(): Promise<number> {
    try {
      const settings = await this.systemConfig.getValue<{
        loginFailThreshold?: number;
      }>(SETTINGS_KEY);
      if (
        settings &&
        typeof settings.loginFailThreshold === 'number' &&
        settings.loginFailThreshold > 0
      ) {
        return settings.loginFailThreshold;
      }
    } catch {
      // 配置读取失败时静默回退
    }
    return this.envAccountThreshold;
  }

  /**
   * 是否已锁定（账号阈值优先读后台配置，IP 固定 50 次/窗口）。
   *
   * 阈值边界竞态说明：isLocked 的「读计数 → 比对阈值」与 recordFailure 的「incr」
   * 是两个独立步骤。Redis 后端下并发失败（同一账号多端同时提交）可能出现：
   * 本请求读到 N-1 未锁，同时另一请求已 incr 到 N，双双通过 isLocked 后各自再
   * incr，导致窗口内计数略超阈值才真正拦截。此为「尽力而为」的爆破速率限制，
   * 不追求强一致，可接受。
   * 演进方向：Redis 后端可在 recordFailure 用 INCR 返回值直接判锁
   * （next >= threshold 即锁定），一次原子操作完成「计数 + 判定」，消除读-改-写竞态；
   * 内存后端在 JS 单线程下无此竞态。
   */
  async isLocked(accountId: string, ip: string): Promise<boolean> {
    const threshold = await this.getAccountThreshold();
    const accountFails =
      (await this.cache.get<number>(`auth:lock:${accountId}`)) ?? 0;
    const ipFails = (await this.cache.get<number>(`auth:lock:ip:${ip}`)) ?? 0;
    return accountFails >= threshold || ipFails >= this.ipThreshold;
  }

  /** 当前账号剩余可尝试次数（≥0；达到阈值即锁定） */
  async getRemainingAttempts(accountId: string): Promise<number> {
    const threshold = await this.getAccountThreshold();
    const accountFails =
      (await this.cache.get<number>(`auth:lock:${accountId}`)) ?? 0;
    return Math.max(0, threshold - accountFails);
  }

  async recordFailure(accountId: string, ip: string): Promise<void> {
    // incr(key, ttl)：固定窗口原子递增（Redis 后端 INCR + 首次 EXPIRE；内存后端同语义）
    await this.cache.incr(`auth:lock:${accountId}`, this.lockTtl);
    await this.cache.incr(`auth:lock:ip:${ip}`, this.lockTtl);
    // 业务指标：登录失败计数（按账户/IP 维度合并为一次）
    this.metrics.incLoginFailure('invalid_credentials');
  }

  async resetOnSuccess(accountId: string, ip: string): Promise<void> {
    await this.cache.del(`auth:lock:${accountId}`);
    await this.cache.del(`auth:lock:ip:${ip}`);
  }
}
