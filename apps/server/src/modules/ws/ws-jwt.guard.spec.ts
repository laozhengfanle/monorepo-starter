import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { WsJwtGuard, extractWsToken } from './ws-jwt.guard.js';
import { TokenBlacklistService } from '../auth/token-blacklist.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

interface FakeSocket {
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, unknown>;
  };
  data: Record<string, unknown>;
}

function makeSocket(overrides: Partial<FakeSocket> = {}): FakeSocket {
  return {
    handshake: { auth: {}, headers: {} },
    data: {},
    ...overrides,
  };
}

describe('extractWsToken', () => {
  it('优先取 handshake.auth.token', () => {
    const socket = makeSocket({
      handshake: { auth: { token: 'auth-token' }, headers: {} },
    });
    expect(extractWsToken(socket as never)).toBe('auth-token');
  });

  it('auth 无 token 时回退 Authorization header', () => {
    const socket = makeSocket({
      handshake: {
        auth: {},
        headers: { authorization: 'Bearer header-token' },
      },
    });
    expect(extractWsToken(socket as never)).toBe('header-token');
  });

  it('两者都无 → null', () => {
    expect(extractWsToken(makeSocket() as never)).toBeNull();
  });
});

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
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
        WsJwtGuard,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: () => 'secret' } },
        { provide: PrismaService, useValue: prisma },
        { provide: TokenBlacklistService, useValue: blacklist },
      ],
    }).compile();
    guard = moduleRef.get(WsJwtGuard);
  });

  it('verifyHandshake：有效 token → 挂 user 并 next()', async () => {
    const client = makeSocket({
      handshake: { auth: { token: 'valid' }, headers: {} },
    });
    const next = vi.fn<(err?: Error) => void>();

    await guard.verifyHandshake(client as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(client.data.user).toEqual({ accountId: 'acc-1', userType: 'admin' });
  });

  it('verifyHandshake：无 token → next(err)', async () => {
    const next = vi.fn<(err?: Error) => void>();

    await guard.verifyHandshake(makeSocket() as never, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('verifyHandshake：验签失败 → next(err)', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));

    await guard.verifyHandshake(
      makeSocket({
        handshake: { auth: { token: 'bad' }, headers: {} },
      }) as never,
      vi.fn((err?: Error) => {
        expect(err).toBeInstanceOf(Error);
      }),
    );
  });

  it('canActivate：消息级校验失败抛 WsException', async () => {
    prisma.client.account.findUnique.mockResolvedValue(null);

    const context = {
      switchToWs: () => ({
        getClient: () =>
          makeSocket({
            handshake: { auth: { token: 'x' }, headers: {} },
          }) as never,
      }),
    };

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      WsException,
    );
  });
});
