import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Counter, register as defaultRegistry } from 'prom-client';
import { BizException } from '@starter/server-core';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { TokenIssuanceService } from './token-issuance.service.js';
import { LoginLockService } from './login-lock.service.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { TurnstileService } from '../turnstile/turnstile.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

// mock bcrypt：避免真实哈希（测试速度 + 可控返回值）
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn<any>().mockResolvedValue(true),
    hash: vi.fn<any>().mockResolvedValue('hashed'),
  },
}));
import bcrypt from 'bcrypt';

/** 构造带 account 的 identity 行 */
function makeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'identity-1',
    accountId: 'acc-1',
    identityType: 'username',
    identifier: 'root',
    credential: 'hashed-password',
    verified: true,
    account: {
      id: 'acc-1',
      userType: 'admin',
      enabled: true,
      ...(overrides.account ?? {}),
    },
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    client: {
      accountIdentity: { findUnique: ReturnType<typeof vi.fn<any>> };
      account: { update: ReturnType<typeof vi.fn<any>> };
    };
  };
  let loginLock: {
    isLocked: ReturnType<typeof vi.fn<any>>;
    recordFailure: ReturnType<typeof vi.fn<any>>;
    resetOnSuccess: ReturnType<typeof vi.fn<any>>;
    getRemainingAttempts: ReturnType<typeof vi.fn<any>>;
  };
  let audit: { write: ReturnType<typeof vi.fn<any>> };
  let tokenIssuance: {
    issueTokens: ReturnType<typeof vi.fn<any>>;
    refresh: ReturnType<typeof vi.fn<any>>;
  };
  let turnstile: { verify: ReturnType<typeof vi.fn<any>> };
  let loginSuccessCounter: Counter<string>;

  const req = {
    ip: '1.2.3.4',
    headers: { 'user-agent': 'test-agent' },
  } as never;

  beforeEach(async () => {
    // 每次测试前清理默认注册表，避免 metric 重复注册（同一 spec 内多次 beforeAll）
    defaultRegistry.clear();
    // 默认密码校验通过
    (bcrypt.compare as ReturnType<typeof vi.fn<any>>).mockResolvedValue(true);
    prisma = {
      client: {
        accountIdentity: {
          findUnique: vi.fn<any>().mockResolvedValue(makeIdentity()),
        },
        account: { update: vi.fn<any>().mockResolvedValue({}) },
      },
    };
    loginLock = {
      isLocked: vi.fn<any>().mockResolvedValue(false),
      recordFailure: vi.fn<any>().mockResolvedValue(undefined),
      resetOnSuccess: vi.fn<any>().mockResolvedValue(undefined),
      getRemainingAttempts: vi.fn<any>().mockResolvedValue(3),
    };
    audit = { write: vi.fn<any>().mockResolvedValue(undefined) };
    tokenIssuance = {
      issueTokens: vi
        .fn<any>()
        .mockResolvedValue({
          accessToken: 'at',
          refreshToken: 'rt',
          expiresIn: 900,
        }),
      refresh: vi
        .fn<any>()
        .mockResolvedValue({
          accessToken: 'at2',
          refreshToken: 'rt2',
          expiresIn: 900,
        }),
    };
    turnstile = { verify: vi.fn<any>().mockResolvedValue(undefined) };
    loginSuccessCounter = new Counter({
      name: 'auth_login_success_total_test',
      help: 'h',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenIssuanceService, useValue: tokenIssuance },
        { provide: LoginLockService, useValue: loginLock },
        { provide: AuditService, useValue: audit },
        { provide: TurnstileService, useValue: turnstile },
        { provide: ConfigService, useValue: { get: () => undefined } },
        {
          provide: 'PROM_METRIC_AUTH_LOGIN_SUCCESS_TOTAL',
          useValue: loginSuccessCounter,
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('adminLogin：登录成功 → 清失败计数 + 更新 lastLogin + 审计 + 签发 token', async () => {
    const tokens = await service.adminLogin(
      { username: 'root', password: 'Root!123' },
      req,
    );

    expect(turnstile.verify).toHaveBeenCalled();
    expect(loginLock.resetOnSuccess).toHaveBeenCalledWith('acc-1', '1.2.3.4');
    expect(prisma.client.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        accountId: 'acc-1',
      }),
    );
    expect(tokenIssuance.issueTokens).toHaveBeenCalledWith('acc-1', 'admin');
    expect(tokens.accessToken).toBe('at');
  });

  it('adminLogin：账号被锁定 → 审计 LOGIN_LOCKED + 抛 ACCOUNT_LOCKED', async () => {
    loginLock.isLocked.mockResolvedValue(true);

    await expect(
      service.adminLogin({ username: 'root', password: 'xpassword123' }, req),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });

    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.LOGIN_LOCKED }),
    );
  });

  it('adminLogin：密码错误 → 记失败 + 审计 LOGIN_FAILED + 带剩余次数', async () => {
    (bcrypt.compare as ReturnType<typeof vi.fn<any>>).mockResolvedValue(false);
    const error = (await service
      .adminLogin({ username: 'root', password: 'wrongpassword' }, req)
      .catch((e: BizException) => e)) as BizException;

    expect(loginLock.recordFailure).toHaveBeenCalledWith('acc-1', '1.2.3.4');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.LOGIN_FAILED }),
    );
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.details?.remainingAttempts).toEqual(['3']);
  });

  it('adminLogin：账号不存在 → 与密码错误同一提示（防枚举）', async () => {
    prisma.client.accountIdentity.findUnique.mockResolvedValue(null);

    await expect(
      service.adminLogin({ username: 'ghost', password: 'xpassword123' }, req),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('adminLogin：账号禁用 → 抛 ACCOUNT_DISABLED', async () => {
    prisma.client.accountIdentity.findUnique.mockResolvedValue(
      makeIdentity({ account: { enabled: false } }),
    );

    await expect(
      service.adminLogin({ username: 'root', password: 'Root!123' }, req),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('refresh：入口 zod 校验通过 → 透传 refreshToken 到 tokenIssuance', async () => {
    const tokens = await service.refresh('valid-refresh-token', req);

    expect(tokenIssuance.refresh).toHaveBeenCalledWith('valid-refresh-token', {
      ip: '1.2.3.4',
      userAgent: 'test-agent',
    });
    expect(tokens.accessToken).toBe('at2');
  });

  it('refresh：空 refreshToken → zod 校验拒绝，不进入 tokenIssuance', async () => {
    await expect(service.refresh('', req)).rejects.toThrow(
      'refreshToken 不能为空',
    );

    expect(tokenIssuance.refresh).not.toHaveBeenCalled();
  });

  it('refresh：缺 req（内部调用）→ 不附带客户端信息', async () => {
    await service.refresh('valid-refresh-token');

    expect(tokenIssuance.refresh).toHaveBeenCalledWith(
      'valid-refresh-token',
      undefined,
    );
  });
});
