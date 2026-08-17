import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { CacheAdminService } from './cache-admin.service.js';
import { CACHE_SERVICE_TOKEN } from '../../common/cache/cache.interface.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

describe('CacheAdminService', () => {
  let service: CacheAdminService;
  let cache: {
    scanKeys: ReturnType<typeof vi.fn<any>>;
    getKeyType: ReturnType<typeof vi.fn<any>>;
    ttl: ReturnType<typeof vi.fn<any>>;
    get: ReturnType<typeof vi.fn<any>>;
    del: ReturnType<typeof vi.fn<any>>;
    delByPattern: ReturnType<typeof vi.fn<any>>;
    exists: ReturnType<typeof vi.fn<any>>;
    getStats: ReturnType<typeof vi.fn<any>>;
  };
  let audit: { write: ReturnType<typeof vi.fn<any>> };

  beforeEach(async () => {
    cache = {
      scanKeys: vi.fn<any>().mockResolvedValue(['a', 'b']),
      getKeyType: vi.fn<any>().mockResolvedValue('string'),
      ttl: vi.fn<any>().mockResolvedValue(60),
      get: vi.fn<any>().mockResolvedValue('v'),
      del: vi.fn<any>().mockResolvedValue(true),
      delByPattern: vi.fn<any>().mockResolvedValue(2),
      exists: vi.fn<any>().mockResolvedValue(true),
      getStats: vi
        .fn<any>()
        .mockResolvedValue({ usedMemory: '1MB', hitRate: '50%', uptime: '1d' }),
    };
    audit = { write: vi.fn<any>().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CacheAdminService,
        { provide: CACHE_SERVICE_TOKEN, useValue: cache },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(CacheAdminService);
  });

  it('listKeys：分页 + 序列化 value（字符串原样，对象 JSON）', async () => {
    cache.get
      .mockResolvedValueOnce('raw-string')
      .mockResolvedValueOnce({ a: 1 });

    const result = await service.listKeys({
      pattern: 'sys:*',
      offset: 0,
      limit: 10,
    });

    expect(cache.scanKeys).toHaveBeenCalledWith('sys:*');
    expect(result.total).toBe(2);
    expect(result.items[0].value).toBe('raw-string');
    expect(result.items[1].value).toBe('{"a":1}');
    expect(result.items[0].type).toBe('string');
    expect(result.items[0].ttl).toBe(60);
  });

  it('listKeys：zod 校验 limit ≤ 500（超限抛错）', async () => {
    await expect(
      service.listKeys({ pattern: '*', offset: 0, limit: 501 }),
    ).rejects.toThrow('limit');
  });

  it('getValue：单 key 查询（null 值 → value=null, size=0）', async () => {
    cache.get.mockResolvedValue(null);

    const result = await service.getValue('missing');

    expect(result).toEqual({
      key: 'missing',
      type: 'string',
      ttl: 60,
      value: null,
      size: 0,
    });
  });

  it('delete：委托 cache.del 并返回 exists 结果，成功后写审计', async () => {
    cache.exists.mockResolvedValue(false);

    expect(await service.delete('missing', 'op-1')).toBe(false);
    expect(cache.del).toHaveBeenCalledWith('missing');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'op-1',
        action: AUDIT_ACTIONS.CACHE_KEY_DELETED,
        detail: expect.objectContaining({ key: 'missing' }),
      }),
    );
  });

  it('deleteKeys：仅删除存在的 key，返回计数，成功后写审计', async () => {
    (cache.exists as ReturnType<typeof vi.fn>).mockImplementation(
      async (key: string) => key !== 'missing',
    );

    const result = await service.deleteKeys(['a', 'missing', 'c'], 'op-1');

    expect(cache.del).toHaveBeenCalledTimes(2);
    expect(result.deletedCount).toBe(2);
    expect(result.keys).toEqual(['a', 'missing', 'c']);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'op-1',
        action: AUDIT_ACTIONS.CACHE_KEY_DELETED,
        detail: expect.objectContaining({
          keys: ['a', 'missing', 'c'],
          deletedCount: 2,
        }),
      }),
    );
  });

  it('clearByPattern：scanKeys 后逐个删除，成功后写审计', async () => {
    cache.scanKeys.mockResolvedValue([
      'auth:lock:acc-1',
      'auth:lock:ip:1.2.3.4',
    ]);

    const count = await service.clearByPattern('auth:lock:*', 'op-1');

    expect(cache.scanKeys).toHaveBeenCalledWith('auth:lock:*');
    expect(cache.del).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'op-1',
        action: AUDIT_ACTIONS.CACHE_PATTERN_CLEARED,
        detail: expect.objectContaining({
          pattern: 'auth:lock:*',
          deletedCount: 2,
        }),
      }),
    );
  });

  it('clearByPattern：纯通配符模式被拒绝', async () => {
    await expect(service.clearByPattern('*', 'op-1')).rejects.toMatchObject({
      code: 'CACHE_PATTERN_UNSAFE',
    });
  });

  it('getStats：透传缓存统计', async () => {
    const stats = await service.getStats();

    expect(stats).toEqual({ usedMemory: '1MB', hitRate: '50%', uptime: '1d' });
  });
});
