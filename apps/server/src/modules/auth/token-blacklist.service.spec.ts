import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { CACHE_SERVICE_TOKEN } from '../../common/cache/cache.interface.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let cache: {
    delByPattern: ReturnType<typeof vi.fn<any>>;
    setex: ReturnType<typeof vi.fn<any>>;
    get: ReturnType<typeof vi.fn<any>>;
  };
  let prisma: {
    client: {
      account: { update: ReturnType<typeof vi.fn<any>> };
      tokenRevocation: {
        create: ReturnType<typeof vi.fn<any>>;
        findFirst: ReturnType<typeof vi.fn<any>>;
      };
    };
  };

  beforeEach(async () => {
    cache = {
      delByPattern: vi.fn<any>().mockResolvedValue(undefined),
      setex: vi.fn<any>().mockResolvedValue(undefined),
      get: vi.fn<any>().mockResolvedValue(null),
    };
    prisma = {
      client: {
        account: { update: vi.fn<any>().mockResolvedValue({}) },
        tokenRevocation: {
          create: vi.fn<any>().mockResolvedValue({}),
          findFirst: vi.fn<any>().mockResolvedValue(null),
        },
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: CACHE_SERVICE_TOKEN, useValue: cache },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(TokenBlacklistService);
  });

  it('revokeAccountTokens：tokenVersion 自增 + 清空该账号 refresh 缓存', async () => {
    await service.revokeAccountTokens('acc-1', 'logout');

    expect(prisma.client.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { tokenVersion: { increment: 1 } },
    });
    expect(cache.delByPattern).toHaveBeenCalledWith('auth:refresh:acc-1:*');
  });

  it('revokeToken：写入撤销记录（7 天过期）+ 缓存 jti', async () => {
    await service.revokeToken('jti-1', 'acc-1', 'password_changed');

    expect(prisma.client.tokenRevocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jti: 'jti-1',
          accountId: 'acc-1',
          reason: 'password_changed',
        }),
      }),
    );
    expect(cache.setex).toHaveBeenCalledWith(
      'auth:revoked:jti-1',
      expect.any(Number),
      '1',
    );
  });

  it('isRevoked：缓存命中立即判定已撤销', async () => {
    cache.get.mockResolvedValue('1');

    expect(await service.isRevoked('jti-1', 'acc-1')).toBe(true);
    expect(prisma.client.tokenRevocation.findFirst).not.toHaveBeenCalled();
  });

  it('isRevoked：缓存未命中时查 DB（jti 精确 + 通配 *）', async () => {
    prisma.client.tokenRevocation.findFirst.mockResolvedValue({ id: 'row-1' });

    expect(await service.isRevoked('jti-1', 'acc-1')).toBe(true);
    expect(prisma.client.tokenRevocation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jti: { in: ['jti-1', '*'] },
          accountId: 'acc-1',
        }),
      }),
    );
  });

  it('isRevoked：无记录返回 false', async () => {
    expect(await service.isRevoked('jti-1', 'acc-1')).toBe(false);
  });
});
