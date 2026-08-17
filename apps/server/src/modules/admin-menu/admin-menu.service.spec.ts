import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { AdminMenuService } from './admin-menu.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

function makeMenuRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    parentId: null,
    name: '角色管理',
    code: 'role:list',
    type: 'menu',
    path: '/admin/roles',
    icon: null,
    sort: 1,
    enabled: true,
    visible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AdminMenuService', () => {
  let service: AdminMenuService;
  let prisma: {
    client: {
      adminMenu: {
        findMany: ReturnType<typeof vi.fn<any>>;
        findUnique: ReturnType<typeof vi.fn<any>>;
        create: ReturnType<typeof vi.fn<any>>;
        update: ReturnType<typeof vi.fn<any>>;
        count: ReturnType<typeof vi.fn<any>>;
        delete: ReturnType<typeof vi.fn<any>>;
      };
      $transaction: ReturnType<typeof vi.fn<any>>;
      adminAccountMenu: { deleteMany: ReturnType<typeof vi.fn<any>> };
      adminRoleMenu: { deleteMany: ReturnType<typeof vi.fn<any>> };
    };
  };
  let audit: { write: ReturnType<typeof vi.fn<any>> };

  beforeEach(async () => {
    prisma = {
      client: {
        adminMenu: {
          findMany: vi.fn<any>().mockResolvedValue([]),
          findUnique: vi.fn<any>().mockResolvedValue(makeMenuRow()),
          create: vi.fn<any>().mockResolvedValue(makeMenuRow()),
          update: vi.fn<any>().mockResolvedValue(makeMenuRow()),
          count: vi.fn<any>().mockResolvedValue(0),
          delete: vi.fn<any>().mockResolvedValue(makeMenuRow()),
        },
        $transaction: vi
          .fn<any>()
          .mockImplementation(async (arr: unknown) => arr),
        adminAccountMenu: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
        adminRoleMenu: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
      },
    };
    audit = { write: vi.fn<any>().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminMenuService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminMenuService);
  });

  it('create：创建菜单（menu 类型才允许 path） + 审计 MENU_CREATED', async () => {
    await service.create(
      { name: '角色', code: 'role:list', type: 'menu', path: '/admin/roles' },
      'op-1',
    );

    expect(prisma.client.adminMenu.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'role:list',
          path: '/admin/roles',
        }),
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.MENU_CREATED,
        accountId: 'op-1',
      }),
    );
  });

  it('create：唯一约束冲突 → 抛 MENU_CODE_EXISTS', async () => {
    prisma.client.adminMenu.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create({ name: 'x', code: 'dup', type: 'menu' }, 'op-1'),
    ).rejects.toMatchObject({ code: 'MENU_CODE_EXISTS' });
  });

  it('update：菜单不存在 → 抛 MENU_NOT_FOUND', async () => {
    prisma.client.adminMenu.findUnique.mockResolvedValue(null);

    await expect(
      service.update('nope', { name: 'x' }, 'op-1'),
    ).rejects.toMatchObject({
      code: 'MENU_NOT_FOUND',
    });
  });

  it('update：不能将菜单挂到自身 → 抛 MENU_PARENT_SELF', async () => {
    await expect(
      service.update('m1', { parentId: 'm1' }, 'op-1'),
    ).rejects.toMatchObject({ code: 'MENU_PARENT_SELF' });
  });

  it('remove：存在子菜单 → 抛 MENU_HAS_CHILDREN', async () => {
    prisma.client.adminMenu.count.mockResolvedValue(3);

    await expect(service.remove('m1', 'op-1')).rejects.toMatchObject({
      code: 'MENU_HAS_CHILDREN',
    });
  });

  it('remove：正常删除（清理账户覆盖 + 角色绑定 + 菜单） + 审计 MENU_DELETED', async () => {
    const result = await service.remove('m1', 'op-1');

    // 事务内三个清理操作（deleteMany/delete 以正确参数被调用）
    expect(prisma.client.adminAccountMenu.deleteMany).toHaveBeenCalledWith({
      where: { menuId: 'm1' },
    });
    expect(prisma.client.adminRoleMenu.deleteMany).toHaveBeenCalledWith({
      where: { menuId: 'm1' },
    });
    expect(prisma.client.adminMenu.delete).toHaveBeenCalledWith({
      where: { id: 'm1' },
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.MENU_DELETED,
        resourceId: 'm1',
      }),
    );
    expect(result.code).toBe('role:list');
  });
});
