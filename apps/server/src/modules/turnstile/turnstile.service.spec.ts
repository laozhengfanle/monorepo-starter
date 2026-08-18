import { Test } from '@nestjs/testing';
import { BizException } from '@starter/server-core';
import { BadRequestException } from '@nestjs/common';
import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TurnstileService } from './turnstile.service.js';
import { CACHE_SERVICE_TOKEN } from '../../common/cache/cache.interface.js';
import { SystemConfigService } from '../system-config/system-config.service.js';

describe('TurnstileService', () => {
  let service: TurnstileService;
  let cache: {
    exists: ReturnType<typeof vi.fn<any>>;
    setex: ReturnType<typeof vi.fn<any>>;
    setnx: ReturnType<typeof vi.fn<any>>;
  };
  let systemConfig: { getValue: ReturnType<typeof vi.fn<any>> };
  const origFetch = globalThis.fetch;
  const origNodeEnv = process.env['NODE_ENV'];
  const origSecret = process.env['TURNSTILE_SECRET_KEY'];
  const origBypass = process.env['TURNSTILE_DEV_BYPASS'];

  /** 配置注入辅助 */
  function configure(config: { enabled?: boolean; secretKey?: string }) {
    systemConfig.getValue.mockResolvedValue({
      enabled: config.enabled ?? false,
      siteKey: 'site-key',
      secretKey: config.secretKey ?? '',
    });
  }

  beforeEach(async () => {
    cache = {
      exists: vi.fn<any>().mockResolvedValue(false),
      setex: vi.fn<any>().mockResolvedValue(undefined),
      setnx: vi.fn<any>().mockResolvedValue(true),
    };
    systemConfig = { getValue: vi.fn<any>().mockResolvedValue(null) };
    delete process.env['TURNSTILE_SECRET_KEY'];
    delete process.env['TURNSTILE_DEV_BYPASS'];
    process.env['NODE_ENV'] = 'test';

    const moduleRef = await Test.createTestingModule({
      providers: [
        TurnstileService,
        { provide: CACHE_SERVICE_TOKEN, useValue: cache },
        { provide: SystemConfigService, useValue: systemConfig },
      ],
    }).compile();
    service = moduleRef.get(TurnstileService);
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = origNodeEnv;
    if (origSecret === undefined) delete process.env['TURNSTILE_SECRET_KEY'];
    else process.env['TURNSTILE_SECRET_KEY'] = origSecret;
    if (origBypass === undefined) delete process.env['TURNSTILE_DEV_BYPASS'];
    else process.env['TURNSTILE_DEV_BYPASS'] = origBypass;
  });

  it('未配置（enabled=false 且无 secret）→ 跳过验证直接放行', async () => {
    configure({ enabled: false });

    await expect(service.verify(undefined)).resolves.toBeUndefined();
  });

  it('已启用但缺 token → 抛 TURNSTILE_FAILED', async () => {
    configure({ enabled: true, secretKey: 'real-secret' });

    await expect(service.verify(undefined)).rejects.toMatchObject({
      code: 'TURNSTILE_FAILED',
    });
  });

  it('测试密钥 → 快速通道放行（不调 siteverify）', async () => {
    configure({
      enabled: true,
      secretKey: '1x0000000000000000000000000000000AA',
    });
    const fetchSpy = vi.fn<any>();
    globalThis.fetch = fetchSpy as never;

    await expect(service.verify('any-token')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('生产环境 + 测试密钥 → 抛 TURNSTILE_CONFIG_ERROR（禁测密钥上线）', async () => {
    process.env['NODE_ENV'] = 'production';
    configure({
      enabled: true,
      secretKey: '1x0000000000000000000000000000000AA',
    });

    await expect(service.verify('any-token')).rejects.toMatchObject({
      code: 'TURNSTILE_CONFIG_ERROR',
    });
  });

  it('dev bypass 默认关闭（未设 TURNSTILE_DEV_BYPASS）→ 拒绝本地 bypass token', async () => {
    process.env['NODE_ENV'] = 'development';
    configure({ enabled: true, secretKey: 'real-secret' });

    await expect(service.verify('LOCAL_DEV_BYPASS_xxx')).rejects.toMatchObject({
      code: 'TURNSTILE_FAILED',
    });
  });

  it('dev bypass 显式开启（development + TURNSTILE_DEV_BYPASS=1）→ 放行', async () => {
    process.env['NODE_ENV'] = 'development';
    process.env['TURNSTILE_DEV_BYPASS'] = '1';
    configure({ enabled: true, secretKey: 'real-secret' });
    const fetchSpy = vi.fn<any>();
    globalThis.fetch = fetchSpy as never;

    await expect(
      service.verify('LOCAL_DEV_BYPASS_xxx'),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('非 development 环境即使开开关也拒绝本地 bypass token', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['TURNSTILE_DEV_BYPASS'] = '1';
    configure({ enabled: true, secretKey: 'real-secret' });

    await expect(service.verify('LOCAL_DEV_BYPASS_xxx')).rejects.toMatchObject({
      code: 'TURNSTILE_FAILED',
    });
  });

  it('防重放：setnx 认领失败（token 已用）→ 拒绝', async () => {
    configure({ enabled: true, secretKey: 'real-secret' });
    globalThis.fetch = vi.fn<any>().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    }) as never;
    cache.setnx.mockResolvedValue(false);

    await expect(service.verify('used-token')).rejects.toBeInstanceOf(
      BizException,
    );
  });

  it('siteverify 失败 → 抛 BadRequestException（且不认领 token）', async () => {
    configure({ enabled: true, secretKey: 'real-secret' });
    globalThis.fetch = vi.fn<any>().mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    }) as never;

    await expect(
      service.verify('fresh-token', '1.2.3.4'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cache.setnx).not.toHaveBeenCalled();
  });

  it('siteverify 成功 → setnx 原子认领（5 分钟防重放 TTL）', async () => {
    configure({ enabled: true, secretKey: 'real-secret' });
    globalThis.fetch = vi.fn<any>().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    }) as never;

    await expect(service.verify('fresh-token')).resolves.toBeUndefined();
    expect(cache.setnx).toHaveBeenCalledWith(
      'turnstile:used:fresh-token',
      true,
      300,
    );
  });
});
