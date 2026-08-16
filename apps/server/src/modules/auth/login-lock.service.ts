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
