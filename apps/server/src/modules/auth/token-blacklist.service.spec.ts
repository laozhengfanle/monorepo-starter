import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { CACHE_SERVICE_TOKEN } from '../../common/cache/cache.interface.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let cache: {
    delByPattern: ReturnType<typeof vi.fn<any>>;
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

  it('revokeAccountTokens：tokenVersion 自增 + 写 jti="*" 通配行 + 清空 refresh 缓存', async () => {
    await service.revokeAccountTokens('acc-1', 'logout');

    // 1. tokenVersion 自增（终局防线）
    expect(prisma.client.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { tokenVersion: { increment: 1 } },
    });
    // 2. 写 jti='*' 通配撤销行（持久化兜底，refresh 的 isRevoked 才能命中）
    expect(prisma.client.tokenRevocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'acc-1',
          jti: '*',
          reason: 'logout',
        }),
      }),
    );
    // 3. 清 stale refresh 缓存
    expect(cache.delByPattern).toHaveBeenCalledWith('auth:refresh:acc-1:*');
  });

  it('isRevoked：DB 命中精确 jti 或 "*" 通配行 → true', async () => {
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

  it('isRevoked：DB 无记录 → false', async () => {
    expect(await service.isRevoked('jti-1', 'acc-1')).toBe(false);
  });
});
