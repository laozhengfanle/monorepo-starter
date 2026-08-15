import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';

/** 登录锁定默认配置：5 次失败 / 15 分钟窗口 / 同 IP 50 次 */
const DEFAULT_ACCOUNT_THRESHOLD = 5;
const DEFAULT_IP_THRESHOLD = 50;
const DEFAULT_LOCK_TTL = 15 * 60;

/**
 * 登录失败锁定：
 * - 账号失败计数：auth:lock:{accountId}（5 次/15min → 锁定）
 * - IP 失败计数：auth:lock:ip:{ip}（50 次/15min → 锁定）
 * - 成功登录时清零
 */
@Injectable()
export class LoginLockService {
  private readonly accountThreshold: number;
  private readonly ipThreshold: number;
  private readonly lockTtl: number;

  constructor(
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    configService: ConfigService,
  ) {
    this.accountThreshold =
      Number(configService.get<string>('LOGIN_LOCK_ACCOUNT_THRESHOLD')) || DEFAULT_ACCOUNT_THRESHOLD;
    this.ipThreshold = Number(configService.get<string>('LOGIN_LOCK_IP_THRESHOLD')) || DEFAULT_IP_THRESHOLD;
    this.lockTtl = Number(configService.get<string>('LOGIN_LOCK_TTL')) || DEFAULT_LOCK_TTL;
  }

  async isLocked(accountId: string, ip: string): Promise<boolean> {
    const accountFails = (await this.cache.get<number>(`auth:lock:${accountId}`)) ?? 0;
    const ipFails = (await this.cache.get<number>(`auth:lock:ip:${ip}`)) ?? 0;
    return accountFails >= this.accountThreshold || ipFails >= this.ipThreshold;
  }

  async recordFailure(accountId: string, ip: string): Promise<void> {
    await this.cache.incr(`auth:lock:${accountId}`, this.lockTtl);
    await this.cache.incr(`auth:lock:ip:${ip}`, this.lockTtl);
  }

  async resetOnSuccess(accountId: string, ip: string): Promise<void> {
    await this.cache.del(`auth:lock:${accountId}`);
    await this.cache.del(`auth:lock:ip:${ip}`);
  }
}
