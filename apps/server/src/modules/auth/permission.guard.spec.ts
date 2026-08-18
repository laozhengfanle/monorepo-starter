import { Test } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { PermissionGuard } from './permission.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

function makeAccount(roleCode: string, roleMenus: string[] = []) {
  return {
    id: 'acc-1',
    adminRoles: [
      {
        role: {
          code: roleCode,
          roleMenus: roleMenus.map((code) => ({
            menu: { code, enabled: true },
          })),
        },
      },
    ],
  };
}

function httpContext(user: unknown): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let prisma: {
    client: {
      account: { findUnique: ReturnType<typeof vi.fn<any>> };
      adminAccountMenu: { findMany: ReturnType<typeof vi.fn<any>> };
    };
  };
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn<any>> };

  beforeEach(async () => {
    prisma = {
      client: {
        account: {
          findUnique: vi
            .fn<any>()
            .mockResolvedValue(makeAccount('admin', ['user:read'])),
        },
        adminAccountMenu: { findMany: vi.fn<any>().mockResolvedValue([]) },
      },
    };
    reflector = {
      getAllAndOverride: vi.fn<any>().mockReturnValue(['user:read']),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        { provide: Reflector, useValue: reflector },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    guard = moduleRef.get(PermissionGuard);
  });

  it('无 @RequirePermission → 直接放行', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(await guard.canActivate(httpContext({ accountId: 'acc-1' }))).toBe(
      true,
    );
  });

  it('未认证（无 user）→ 403', async () => {
    await expect(guard.canActivate(httpContext(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('普通角色拥有权限点 → 放行', async () => {
    expect(await guard.canActivate(httpContext({ accountId: 'acc-1' }))).toBe(
      true,
    );
  });

  it('普通角色缺少权限点 → 403 权限不足', async () => {
    reflector.getAllAndOverride.mockReturnValue(['secret:admin']);

    await expect(
      guard.canActivate(httpContext({ accountId: 'acc-1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('super_admin 角色自动绕过（不看权限）', async () => {
    prisma.client.account.findUnique.mockResolvedValue(
      makeAccount('super_admin'),
    );
    reflector.getAllAndOverride.mockReturnValue(['anything:admin']);

    expect(await guard.canActivate(httpContext({ accountId: 'acc-1' }))).toBe(
      true,
    );
  });

  it('账户不存在 → 403', async () => {
    prisma.client.account.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(httpContext({ accountId: 'ghost' })),
    ).rejects.toThrow(ForbiddenException);
  });
});
