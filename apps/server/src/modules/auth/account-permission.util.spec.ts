import { vi, describe, expect, it } from 'vitest';
import {
  resolveAccountPermissions,
  type AccountWithRoleMenus,
} from './account-permission.util.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

function makeAccount(roleCodes: string[]): AccountWithRoleMenus {
  return {
    id: 'acc-1',
    adminRoles: roleCodes.map((code) => ({
      role: {
        code,
        roleMenus: [
          { menu: { code: `${code}:read`, enabled: true } },
          { menu: { code: `${code}:write`, enabled: true } },
          { menu: { code: `${code}:disabled`, enabled: false } }, // 禁用权限点不聚合
        ],
      },
    })),
  };
}

function createPrisma(
  overrides: Array<{ type: string; menu: { code: string } }>,
): PrismaService {
  return {
    client: {
      adminAccountMenu: {
        findMany: vi.fn<any>().mockResolvedValue(overrides),
      },
    },
  } as unknown as PrismaService;
}

describe('resolveAccountPermissions', () => {
  it('角色基线：仅聚合 enabled 的权限点', async () => {
    const prisma = createPrisma([]);
    const codes = await resolveAccountPermissions(
      prisma,
      makeAccount(['user']),
    );

    expect(codes.has('user:read')).toBe(true);
    expect(codes.has('user:write')).toBe(true);
    expect(codes.has('user:disabled')).toBe(false);
  });

  it('多角色权限合并', async () => {
    const prisma = createPrisma([]);
    const codes = await resolveAccountPermissions(
      prisma,
      makeAccount(['user', 'role']),
    );

    expect(codes.size).toBe(4);
    expect(codes.has('user:read')).toBe(true);
    expect(codes.has('role:write')).toBe(true);
  });

  it('grant 覆盖：追加角色没有的权限点', async () => {
    const prisma = createPrisma([
      { type: 'grant', menu: { code: 'config:view' } },
    ]);
    const codes = await resolveAccountPermissions(
      prisma,
      makeAccount(['user']),
    );

    expect(codes.has('config:view')).toBe(true);
  });

  it('deny 覆盖：移除角色已授权的权限点（deny 优先）', async () => {
    const prisma = createPrisma([
      { type: 'deny', menu: { code: 'user:write' } },
    ]);
    const codes = await resolveAccountPermissions(
      prisma,
      makeAccount(['user']),
    );

    expect(codes.has('user:read')).toBe(true);
    expect(codes.has('user:write')).toBe(false);
  });

  it('grant 与 deny 同时存在时 deny 生效', async () => {
    const prisma = createPrisma([
      { type: 'grant', menu: { code: 'user:write' } },
      { type: 'deny', menu: { code: 'user:write' } },
    ]);
    const codes = await resolveAccountPermissions(
      prisma,
      makeAccount(['user']),
    );

    // 顺序执行：grant 后 deny，最终移除
    expect(codes.has('user:write')).toBe(false);
  });
});
