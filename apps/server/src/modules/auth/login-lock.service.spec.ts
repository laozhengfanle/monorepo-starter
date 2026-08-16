import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { LoginLockService } from './login-lock.service.js';
import { CACHE_SERVICE_TOKEN } from '../../common/cache/cache.interface.js';
import { BusinessMetrics } from '../../common/metrics/business.metrics.js';
import { SystemConfigService } from '../system-config/system-config.service.js';

describe('LoginLockService', () => {
  let service: LoginLockService;
  let cache: {
    get: ReturnType<typeof vi.fn>;
    incr: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
  let metrics: {
    incLoginFailure: ReturnType<typeof vi.fn>;
    incLoginLockout: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    cache = {
      get: vi.fn<any>().mockResolvedValue(null),
      incr: vi.fn<any>().mockResolvedValue(1),
      del: vi.fn<any>().mockResolvedValue(undefined),
    };
    metrics = {
      incLoginFailure: vi.fn<any>(),
      incLoginLockout: vi.fn<any>(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginLockService,
        { provide: CACHE_SERVICE_TOKEN, useValue: cache },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'LOGIN_LOCK_ACCOUNT_THRESHOLD' ? '3' : undefined,
          },
        },
        {
          provide: SystemConfigService,
          useValue: { getValue: vi.fn<any>().mockResolvedValue(null) },
        },
        { provide: BusinessMetrics, useValue: metrics },
      ],
    }).compile();
    service = moduleRef.get(LoginLockService);
  });

  it('isLocked：失败次数达到阈值时锁定', async () => {
    cache.get.mockResolvedValue(3); // 阈值 3 次（env 配置）

    expect(await service.isLocked('acc-1', '1.2.3.4')).toBe(true);
  });

  it('isLocked：低于阈值不锁定', async () => {
    cache.get.mockResolvedValue(2);

    expect(await service.isLocked('acc-1', '1.2.3.4')).toBe(false);
  });

  it('getRemainingAttempts：返回剩余可尝试次数', async () => {
    cache.get.mockResolvedValue(1); // 已失败 1 次，阈值 3

    expect(await service.getRemainingAttempts('acc-1')).toBe(2);
  });

  it('recordFailure：累加计数并上报登录失败指标', async () => {
    await service.recordFailure('acc-1', '1.2.3.4');

    expect(cache.incr).toHaveBeenCalledWith(
      'auth:lock:acc-1',
      expect.any(Number),
    );
    expect(cache.incr).toHaveBeenCalledWith(
      'auth:lock:ip:1.2.3.4',
      expect.any(Number),
    );
    expect(metrics.incLoginFailure).toHaveBeenCalledWith('invalid_credentials');
  });

  it('resetOnSuccess：清除账号与 IP 锁定计数', async () => {
    await service.resetOnSuccess('acc-1', '1.2.3.4');

    expect(cache.del).toHaveBeenCalledWith('auth:lock:acc-1');
    expect(cache.del).toHaveBeenCalledWith('auth:lock:ip:1.2.3.4');
  });
});
