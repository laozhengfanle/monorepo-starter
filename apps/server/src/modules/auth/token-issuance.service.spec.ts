import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { TokenIssuanceService } from './token-issuance.service.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { CACHE_SERVICE_TOKEN } from '../../common/cache/cache.interface.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

describe('TokenIssuanceService', () => {
  let service: TokenIssuanceService;
  let jwt: {
    signAsync: ReturnType<typeof vi.fn<any>>;
    verifyAsync: ReturnType<typeof vi.fn<any>>;
  };
  let cache: {
    setex: ReturnType<typeof vi.fn<any>>;
    setnx: ReturnType<typeof vi.fn<any>>;
  };
  let prisma: {
    client: { account: { findUnique: ReturnType<typeof vi.fn<any>> } };
  };
  let blacklist: {
    isRevoked: ReturnType<typeof vi.fn<any>>;
    revokeAccountTokens: ReturnType<typeof vi.fn<any>>;
  };
  let audit: { write: ReturnType<typeof vi.fn<any>> };

  beforeEach(async () => {
    jwt = {
      signAsync: vi.fn<any>().mockResolvedValue('signed-token'),
      verifyAsync: vi.fn<any>().mockResolvedValue({
        sub: 'acc-1',
        userType: 'admin',
        tokenVersion: 0,
        jti: 'jti-1',
      }),
    };
    cache = {
      setex: vi.fn<any>().mockResolvedValue(undefined),
      setnx: vi.fn<any>().mockResolvedValue(true),
    };
    prisma = {
      client: {
        account: {
          findUnique: vi.fn<any>().mockResolvedValue({ tokenVersion: 2 }),
        },
      },
    };
    blacklist = {
      isRevoked: vi.fn<any>().mockResolvedValue(false),
      revokeAccountTokens: vi.fn<any>().mockResolvedValue(undefined),
    };
    audit = { write: vi.fn<any>().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenIssuanceService,
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
        { provide: CACHE_SERVICE_TOKEN, useValue: cache },
        { provide: PrismaService, useValue: prisma },
        { provide: TokenBlacklistService, useValue: blacklist },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(TokenIssuanceService);
  });

  it('issueTokens：payload 带 tokenVersion + jti，双 token 签发', async () => {
    const tokens = await service.issueTokens('acc-1', 'admin');

    expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'acc-1',
        tokenVersion: 2,
        jti: expect.any(String),
      }),
      expect.any(Object),
    );
    expect(tokens.accessToken).toBe('signed-token');
    expect(tokens.expiresIn).toBe(900); // 默认 JWT_ACCESS_TTL
    // refresh token 状态缓存（reuse 检测用）
    expect(cache.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:refresh:acc-1:/),
      expect.any(Number),
      'active',
    );
  });

  it('refresh：校验签名失败 → 401', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));

    await expect(service.refresh('bad-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refresh：token 已在黑名单 → 401', async () => {
    blacklist.isRevoked.mockResolvedValue(true);

    await expect(service.refresh('revoked-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refresh：setnx 认领失败（已使用/并发重放）→ 审计 TOKEN_REUSED + 撤销账号所有 token + 401', async () => {
    cache.setnx.mockResolvedValue(false); // 原子认领失败 = 重用

    await expect(service.refresh('reused-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.TOKEN_REUSED }),
    );
    expect(blacklist.revokeAccountTokens).toHaveBeenCalledWith(
      'acc-1',
      'token_reuse',
    );
  });

  it('refresh：正常刷新 → 原子认领 used + 签发新双 token + 审计 TOKEN_REFRESHED', async () => {
    const tokens = await service.refresh('valid-token', { ip: '1.2.3.4' });

    // reuse 检测走 SET NX 原子认领（key 不存在才认领成功）
    expect(cache.setnx).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:refresh:acc-1:/),
      'used',
      expect.any(Number),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.TOKEN_REFRESHED,
        ip: '1.2.3.4',
      }),
    );
    expect(tokens.accessToken).toBe('signed-token');
  });

  it('logout：委托 blacklist 撤销账号所有 token', async () => {
    await service.logout('acc-1');

    expect(blacklist.revokeAccountTokens).toHaveBeenCalledWith(
      'acc-1',
      'logout',
    );
  });
});
