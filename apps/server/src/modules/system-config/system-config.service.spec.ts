import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import {
  SystemConfigService,
  MASK_PLACEHOLDER,
  PUBLIC_CONFIG_KEYS,
} from './system-config.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { CACHE_SERVICE_TOKEN } from '../../common/cache/cache.interface.js';
import { AuditService } from '../auth/audit.service.js';

function makeConfigRow(key: string, value: unknown) {
  return {
    id: `id-${key}`,
    key,
    value,
    remark: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('SystemConfigService', () => {
  let service: SystemConfigService;
  let cache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    client: {
      systemConfig: {
        findMany: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        upsert: ReturnType<typeof vi.fn>;
      };
    };
  };

  beforeEach(async () => {
    cache = {
      get: vi.fn<any>().mockResolvedValue(null),
      set: vi.fn<any>().mockResolvedValue(undefined),
      del: vi.fn<any>().mockResolvedValue(undefined),
    };
    prisma = {
      client: {
        systemConfig: {
          findMany: vi.fn<any>().mockResolvedValue([]),
          findFirst: vi.fn<any>().mockResolvedValue(null),
          update: vi.fn<any>().mockResolvedValue({}),
          upsert: vi.fn<any>().mockResolvedValue({}),
        },
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SystemConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE_TOKEN, useValue: cache },
        {
          provide: AuditService,
          useValue: { write: vi.fn<any>().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = moduleRef.get(SystemConfigService);
  });

  it('getValue：缓存命中时直接返回，不查库', async () => {
    cache.get.mockResolvedValue({ loginFailThreshold: 5 });

    const value = await service.getValue<{ loginFailThreshold: number }>(
      'settings',
    );

    expect(value).toEqual({ loginFailThreshold: 5 });
    expect(prisma.client.systemConfig.findFirst).not.toHaveBeenCalled();
  });

  it('getValue：缓存 miss 时查库并回填缓存（TTL 30 分钟）', async () => {
    prisma.client.systemConfig.findFirst.mockResolvedValue(
      makeConfigRow('settings', { loginFailThreshold: 3 }),
    );

    const value = await service.getValue<{ loginFailThreshold: number }>(
      'settings',
    );

    expect(value).toEqual({ loginFailThreshold: 3 });
    expect(cache.set).toHaveBeenCalledWith(
      'sys:config:settings',
      { loginFailThreshold: 3 },
      1800,
    );
  });

  it('getValue：配置不存在返回 null', async () => {
    const value = await service.getValue('nonexistent');
    expect(value).toBeNull();
  });

  it('listPublic：只返回白名单 key，且敏感字段脱敏', async () => {
    // 模拟 Prisma where { key: { in: PUBLIC_CONFIG_KEYS } } 的过滤行为
    prisma.client.systemConfig.findMany.mockImplementation(
      async (args: {
        where?: { key?: { in?: string[] }; deletedAt?: unknown };
      }) => {
        const allowed = args.where?.key?.in ?? [];
        const rows = [
          makeConfigRow('turnstile.config', {
            enabled: true,
            siteKey: 'k',
            secretKey: 'SECRET',
          }),
          makeConfigRow('settings', { loginFailThreshold: 5 }),
          makeConfigRow('secret.config', { apiKey: 'LEAK' }), // 不在白名单
        ];
        return rows.filter((r) => allowed.includes(r.key));
      },
    );

    const result = await service.listPublic();

    const keys = result.map((c) => c.key);
    expect(keys).not.toContain('secret.config');
    expect(keys).toHaveLength(2);
    expect(keys).toEqual(
      expect.arrayContaining(['settings', 'turnstile.config']),
    );
    expect(PUBLIC_CONFIG_KEYS.has('turnstile.config')).toBe(true);
    const turnstile = result.find((c) => c.key === 'turnstile.config');
    expect(turnstile?.value.secretKey).toBe(MASK_PLACEHOLDER);
    expect(turnstile?.value.siteKey).toBe('k'); // 非敏感字段保留
  });

  it('getByKey：turnstile.config 敏感字段 secretKey 脱敏为占位符', async () => {
    prisma.client.systemConfig.findFirst.mockResolvedValue(
      makeConfigRow('turnstile.config', {
        enabled: true,
        siteKey: 'k',
        secretKey: 'SECRET',
      }),
    );

    const result = await service.getByKey('turnstile.config');

    expect(result?.value.secretKey).toBe(MASK_PLACEHOLDER);
    expect(result?.value.siteKey).toBe('k');
  });

  it('getByKey：storage.driver 云存储凭证 accessKey/secretKey 脱敏', async () => {
    prisma.client.systemConfig.findFirst.mockResolvedValue(
      makeConfigRow('storage.driver', {
        driver: 'oss',
        accessKey: 'AK',
        secretKey: 'SK',
      }),
    );

    const result = await service.getByKey('storage.driver');

    expect(result?.value.accessKey).toBe(MASK_PLACEHOLDER);
    expect(result?.value.secretKey).toBe(MASK_PLACEHOLDER);
    expect(result?.value.driver).toBe('oss'); // 非敏感字段保留
  });

  it('update：敏感字段回传 ****** 时保留数据库旧值，不覆盖真值', async () => {
    prisma.client.systemConfig.findFirst.mockResolvedValue(
      makeConfigRow('turnstile.config', {
        enabled: true,
        siteKey: 'k',
        secretKey: 'OLD_SECRET',
      }),
    );
    prisma.client.systemConfig.update.mockResolvedValue(
      makeConfigRow('turnstile.config', {
        enabled: true,
        siteKey: 'k',
        secretKey: 'OLD_SECRET',
      }),
    );

    const result = await service.update(
      'turnstile.config',
      { value: { enabled: true, siteKey: 'k2', secretKey: MASK_PLACEHOLDER } },
      'op-1',
    );

    // 写入 DB 的值：secretKey 保留旧值，其余字段正常更新
    const updateCall = prisma.client.systemConfig.update.mock.calls[0][0] as {
      data: { value: Record<string, unknown> };
    };
    expect(updateCall.data.value.secretKey).toBe('OLD_SECRET');
    expect(updateCall.data.value.siteKey).toBe('k2');
    // 返回给前端的值仍脱敏，避免回显真密钥
    expect(result.value.secretKey).toBe(MASK_PLACEHOLDER);
  });

  it('remove：配置不存在抛 CONFIG_NOT_FOUND', async () => {
    await expect(service.remove('nope', 'op-1')).rejects.toMatchObject({
      code: 'CONFIG_NOT_FOUND',
    });
  });

  it('remove：存在则软删除 + 失效缓存 + 审计', async () => {
    prisma.client.systemConfig.findFirst.mockResolvedValue(
      makeConfigRow('settings', {}),
    );
    prisma.client.systemConfig.update.mockResolvedValue(
      makeConfigRow('settings', {}),
    );

    const result = await service.remove('settings', 'op-1');

    expect(result).toEqual({ success: true });
    expect(prisma.client.systemConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(cache.del).toHaveBeenCalledWith('sys:config:settings');
  });
});
