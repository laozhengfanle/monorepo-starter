import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { StorageService } from './storage.service.js';
import { SystemConfigService } from '../../modules/system-config/system-config.service.js';

describe('StorageService', () => {
  let service: StorageService;
  let systemConfig: { getValue: ReturnType<typeof vi.fn<any>> };
  const configService = {
    get: (key: string) =>
      key === 'UPLOAD_DIR' ? join(tmpdir(), 'dsh-storage-spec') : undefined,
  };

  beforeEach(async () => {
    systemConfig = { getValue: vi.fn<any>().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: configService },
        { provide: SystemConfigService, useValue: systemConfig },
      ],
    }).compile();
    service = moduleRef.get(StorageService);
  });

  it('createDriver：未配置 → 回退 local 驱动', async () => {
    const driver = await service.createDriver();
    expect(driver.name).toBe('local');
  });

  it('createDriver：显式 local → local 驱动', async () => {
    systemConfig.getValue.mockResolvedValue({ driver: 'local' });

    const driver = await service.createDriver();
    expect(driver.name).toBe('local');
  });

  it('createDriver：配置读取失败（DB 异常）→ 回退 local（fail-open）', async () => {
    systemConfig.getValue.mockRejectedValue(new Error('db down'));

    const driver = await service.createDriver();
    expect(driver.name).toBe('local');
  });

  it.each(['oss', 'cos', 's3'] as const)(
    'createDriver：%s 未实现 → 抛 STORAGE_DRIVER_NOT_IMPLEMENTED（不静默回退 local）',
    async (driverName) => {
      systemConfig.getValue.mockResolvedValue({ driver: driverName });

      await expect(service.createDriver()).rejects.toMatchObject({
        code: 'STORAGE_DRIVER_NOT_IMPLEMENTED',
      });
    },
  );

  it('createDriver：未知驱动 → 抛 STORAGE_DRIVER_UNSUPPORTED', async () => {
    systemConfig.getValue.mockResolvedValue({ driver: 'dropbox' });

    await expect(service.createDriver()).rejects.toMatchObject({
      code: 'STORAGE_DRIVER_UNSUPPORTED',
    });
  });

  it('upload：透传到 local 驱动并返回结果', async () => {
    const result = await service.upload({
      originalName: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('png-data'),
      folder: 'avatars',
    });

    expect(result.storedName).toBeTruthy();
    expect(result.url).toMatch(/^\/uploads\/avatars\//);
    expect(result.size).toBe('png-data'.length);
    // 清理写入临时目录的测试文件
    await fs
      .unlink(join(tmpdir(), 'dsh-storage-spec', 'avatars', result.storedName))
      .catch(() => undefined);
  });

  it('delete：幂等透传（文件不存在不报错）', async () => {
    await expect(
      service.delete({ storedName: 'nope.png', folder: 'avatars' }),
    ).resolves.toBeUndefined();
  });

  it('getUrl：拼接访问 URL', async () => {
    expect(await service.getUrl('x.png', 'files')).toBe('/uploads/files/x.png');
  });
});
