import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { AdminRoleService } from './admin-role.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

function makeRoleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    name: '管理员',
    code: 'admin',
    description: '',
    enabled: true,
    roleMenus: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AdminRoleService', () => {
  let service: AdminRoleService;
  let prisma: {
    client: {
      $transaction: ReturnType<typeof vi.fn>;
      adminRole: {
        findMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      adminRoleMenu: {
        deleteMany: ReturnType<typeof vi.fn>;
        createMany: ReturnType<typeof vi.fn>;
      };
      adminMenu: { findMany: ReturnType<typeof vi.fn> };
      adminAccountRole: { count: ReturnType<typeof vi.fn> };
      adminAccountMenu: { findMany: ReturnType<typeof vi.fn> };
      account: { findUnique: ReturnType<typeof vi.fn> };
    };
  };
  let audit: { write: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      client: {
        $transaction: vi
          .fn<any>()
          .mockImplementation(async (fnOrArr: unknown) => {
            // 支持事务回调与事务数组两种形式
            if (typeof fnOrArr === 'function') {
              return fnOrArr(prisma.client);
            }
            return fnOrArr;
          }),
        adminRole: {
          findMany: vi.fn<any>().mockResolvedValue([makeRoleRow()]),
          findUnique: vi.fn<any>().mockResolvedValue(makeRoleRow()),
          create: vi.fn<any>().mockResolvedValue(makeRoleRow()),
          update: vi.fn<any>().mockResolvedValue(makeRoleRow()),
          delete: vi.fn<any>().mockResolvedValue(makeRoleRow()),
        },
        adminRoleMenu: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
          createMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
        adminMenu: {
          // 模拟按 code 查询：返回与请求 codes 等量的菜单（避免 PERMISSION_NOT_FOUND）
          findMany: vi
            .fn<any>()
            .mockImplementation(async (...args: unknown[]) => {
              const a = args[0] as { where?: { code?: { in?: string[] } } };
              return (a.where?.code?.in ?? []).map((code) => ({
                id: `menu-${code}`,
              }));
            }),
        },
        adminAccountRole: {
          count: vi.fn<any>().mockResolvedValue(0),
        },
        adminAccountMenu: {
          findMany: vi.fn<any>().mockResolvedValue([]),
        },
        account: {
          // 默认操作者为超管（既有用例语义不受影响）；越权用例显式覆盖
          findUnique: vi.fn<any>().mockResolvedValue({
            id: 'op-1',
            adminRoles: [
              {
                role: { code: 'super_admin', roleMenus: [] },
              },
            ],
          }),
        },
      },
    };
    audit = { write: vi.fn<any>().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminRoleService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminRoleService);
  });

  it('create：创建角色 + 绑定权限点 + 审计 ROLE_CREATED', async () => {
    await service.create(
      { name: '运营', code: 'operator', permissionCodes: ['m1', 'm2'] },
      'op-1',
    );

    expect(prisma.client.adminRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'operator' }),
      }),
    );
    expect(prisma.client.adminRoleMenu.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Array) }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.ROLE_CREATED,
        accountId: 'op-1',
      }),
    );
  });

  it('create：唯一约束冲突 → 抛 ROLE_CODE_EXISTS', async () => {
    prisma.client.adminRole.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create({ name: 'x', code: 'dup' }, 'op-1'),
    ).rejects.toMatchObject({
      code: 'ROLE_CODE_EXISTS',
    });
  });

  it('update：super_admin 不允许禁用 → 抛 SUPER_ADMIN_PROTECTED', async () => {
    prisma.client.adminRole.findUnique.mockResolvedValue(
      makeRoleRow({ code: 'super_admin' }),
    );

    await expect(
      service.update('r1', { enabled: false }, 'op-1'),
    ).rejects.toMatchObject({ code: 'SUPER_ADMIN_PROTECTED' });
  });

  it('update：权限点变更时额外审计 PERMISSION_CHANGED', async () => {
    prisma.client.adminRole.findUnique.mockResolvedValue(
      makeRoleRow({
        code: 'admin',
        roleMenus: [{ menu: { code: 'old:perm' } }],
      }),
    );

    await service.update('r1', { permissionCodes: ['new:perm'] }, 'op-1');

    const auditCalls = audit.write.mock.calls.map(
      (c) => c[0] as { action: string },
    );
    expect(
      auditCalls.some((c) => c.action === AUDIT_ACTIONS.ROLE_UPDATED),
    ).toBe(true);
    expect(
      auditCalls.some((c) => c.action === AUDIT_ACTIONS.PERMISSION_CHANGED),
    ).toBe(true);
  });

  it('remove：super_admin 不允许删除', async () => {
    prisma.client.adminRole.findUnique.mockResolvedValue(
      makeRoleRow({ code: 'super_admin' }),
    );

    await expect(service.remove('r1', 'op-1')).rejects.toMatchObject({
      code: 'SUPER_ADMIN_PROTECTED',
    });
  });

  it('remove：已绑定账户 → 抛 ROLE_IN_USE', async () => {
    prisma.client.adminAccountRole.count.mockResolvedValue(2);

    await expect(service.remove('r1', 'op-1')).rejects.toMatchObject({
      code: 'ROLE_IN_USE',
    });
  });

  it('remove：正常删除（角色菜单 + 角色） + 审计 ROLE_DELETED', async () => {
    const result = await service.remove('r1', 'op-1');

    expect(prisma.client.$transaction).toHaveBeenCalledWith(expect.any(Array));
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.ROLE_DELETED,
        resourceId: 'r1',
      }),
    );
    expect(result.code).toBe('admin');
  });

  // ============ P1-1 越权护栏（非超管角色编辑提权） ============

  /** 构造操作者：isSuperAdmin 控制角色；heldRoleIds 控制持有的角色；roleMenus 控制其权限点 */
  function makeOperator(
    isSuperAdmin: boolean,
    heldRoleIds: string[] = ['r1'],
    roleMenus: Array<{ menu: { code: string; enabled: boolean } }> = [],
  ) {
    return {
      id: 'op-1',
      adminRoles: isSuperAdmin
        ? [{ role: { id: 'super', code: 'super_admin', roleMenus: [] } }]
        : heldRoleIds.map((rid) => ({
            role: { id: rid, code: `role-${rid}`, roleMenus },
          })),
    };
  }

  it('越权：非超管 create 授予未持有的权限点 → ROLE_PERMISSION_FORBIDDEN', async () => {
    prisma.client.account.findUnique.mockResolvedValue(
      makeOperator(
        false,
        ['r1'],
        [{ menu: { code: 'a:list', enabled: true } }],
      ),
    );

    await expect(
      service.create(
        { name: 'x', code: 'x', permissionCodes: ['a:list', 'b:admin'] },
        'op-1',
      ),
    ).rejects.toMatchObject({
      code: 'ROLE_PERMISSION_FORBIDDEN',
    });
    // 未发生任何写入
    expect(prisma.client.adminRole.create).not.toHaveBeenCalled();
  });

  it('越权：非超管 create 权限点 ⊆ 已持有 → 允许', async () => {
    prisma.client.account.findUnique.mockResolvedValue(
      makeOperator(
        false,
        ['r1'],
        [{ menu: { code: 'a:list', enabled: true } }],
      ),
    );

    await service.create(
      { name: 'x', code: 'x', permissionCodes: ['a:list'] },
      'op-1',
    );
    expect(prisma.client.adminRole.create).toHaveBeenCalled();
  });

  it('越权：非超管 update 未持有的角色 → ROLE_MANAGE_FORBIDDEN', async () => {
    // 目标角色 r-other（操作者未持有）
    prisma.client.adminRole.findUnique.mockResolvedValue(
      makeRoleRow({ id: 'r-other', code: 'other' }),
    );
    prisma.client.account.findUnique.mockResolvedValue(
      makeOperator(
        false,
        ['r1'],
        [{ menu: { code: 'a:list', enabled: true } }],
      ),
    );

    await expect(
      service.update('r-other', { name: '改名' }, 'op-1'),
    ).rejects.toMatchObject({
      code: 'ROLE_MANAGE_FORBIDDEN',
    });
    expect(prisma.client.adminRole.update).not.toHaveBeenCalled();
  });

  it('越权：非超管 update super_admin 角色 → ROLE_MANAGE_FORBIDDEN', async () => {
    prisma.client.adminRole.findUnique.mockResolvedValue(
      makeRoleRow({ id: 'super', code: 'super_admin' }),
    );
    prisma.client.account.findUnique.mockResolvedValue(
      makeOperator(
        false,
        ['super'],
        [{ menu: { code: 'a:list', enabled: true } }],
      ),
    );

    await expect(
      service.update('super', { name: '改名' }, 'op-1'),
    ).rejects.toMatchObject({
      code: 'ROLE_MANAGE_FORBIDDEN',
    });
  });

  it('越权：非超管 update 已持有角色但授予未持有权限点 → ROLE_PERMISSION_FORBIDDEN', async () => {
    prisma.client.adminRole.findUnique.mockResolvedValue(
      makeRoleRow({ id: 'r1', code: 'admin' }),
    );
    prisma.client.account.findUnique.mockResolvedValue(
      makeOperator(
        false,
        ['r1'],
        [{ menu: { code: 'a:list', enabled: true } }],
      ),
    );

    await expect(
      service.update(
        'r1',
        { permissionCodes: ['a:list', 'secret:admin'] },
        'op-1',
      ),
    ).rejects.toMatchObject({
      code: 'ROLE_PERMISSION_FORBIDDEN',
    });
  });

  it('越权：非超管 remove 未持有的角色 → ROLE_MANAGE_FORBIDDEN', async () => {
    prisma.client.adminRole.findUnique.mockResolvedValue(
      makeRoleRow({ id: 'r-other', code: 'other' }),
    );
    prisma.client.account.findUnique.mockResolvedValue(
      makeOperator(false, ['r1']),
    );

    await expect(service.remove('r-other', 'op-1')).rejects.toMatchObject({
      code: 'ROLE_MANAGE_FORBIDDEN',
    });
  });

  it('越权：超管不受限（可授予任意权限点、管理任意角色）', async () => {
    prisma.client.account.findUnique.mockResolvedValue(makeOperator(true));

    await service.create(
      { name: 'x', code: 'x', permissionCodes: ['config:admin:update'] },
      'op-1',
    );
    expect(prisma.client.adminRole.create).toHaveBeenCalled();
  });
});
