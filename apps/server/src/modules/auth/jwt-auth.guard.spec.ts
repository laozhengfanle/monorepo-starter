import { Test } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

function httpContext(req: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwt: { verifyAsync: ReturnType<typeof vi.fn<any>> };
  let prisma: {
    client: { account: { findUnique: ReturnType<typeof vi.fn<any>> } };
  };
  let blacklist: { isRevoked: ReturnType<typeof vi.fn<any>> };

  beforeEach(async () => {
    jwt = {
      verifyAsync: vi.fn<any>().mockResolvedValue({
        sub: 'acc-1',
        userType: 'admin',
        tokenVersion: 1,
        jti: 'jti-1',
      }),
    };
    prisma = {
      client: {
        account: {
          findUnique: vi
            .fn<any>()
            .mockResolvedValue({ enabled: true, tokenVersion: 1 }),
        },
      },
    };
    blacklist = { isRevoked: vi.fn<any>().mockResolvedValue(false) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: () => 'secret' } },
        { provide: PrismaService, useValue: prisma },
        { provide: TokenBlacklistService, useValue: blacklist },
      ],
    }).compile();
    guard = moduleRef.get(JwtAuthGuard);
  });

  it('有效 token → 放行并挂载 req.user', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } } as never;
    const ok = await guard.canActivate(httpContext(req));

    expect(ok).toBe(true);
    expect((req as { user: unknown }).user).toEqual({
      accountId: 'acc-1',
      userType: 'admin',
    });
  });

  it('无 token → 401', async () => {
    await expect(
      guard.canActivate(httpContext({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('验签失败 → 401', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));

    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer bad' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('账户不存在或禁用 → 401', async () => {
    prisma.client.account.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer t' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('tokenVersion 不一致（改密/踢人后）→ 401', async () => {
    prisma.client.account.findUnique.mockResolvedValue({
      enabled: true,
      tokenVersion: 2,
    });

    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer t' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('jti 在黑名单 → 401', async () => {
    blacklist.isRevoked.mockResolvedValue(true);

    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer t' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('GraphQL 上下文：从 context.req 取 token', async () => {
    const gqlReq = { headers: { authorization: 'Bearer gql-token' } };
    const context = {
      getType: () => 'graphql',
    } as ExecutionContext;
    const createSpy = vi.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({ req: gqlReq }),
    } as never);

    const ok = await guard.canActivate(context);

    expect(ok).toBe(true);
    expect(createSpy).toHaveBeenCalled();
    createSpy.mockRestore();
  });
});
