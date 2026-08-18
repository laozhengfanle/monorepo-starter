import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { AdminAccountService } from './admin-account.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenBlacklistService } from '../auth/token-blacklist.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';
import { StorageService } from '../../common/storage/storage.service.js';

/**
 * admin-account.service 测试（P1-2 超管保护重点覆盖）：
 * - update：非超管不得降权/禁用超管账户（SUPER_ADMIN_DEMOTE_FORBIDDEN）
 * - update：非超管不得授予 super_admin / 未持有角色（防提权）
 * - update/remove/hardRemove：最后一个启用超管不可移除（assertSuperAdminRemains）
 * - 超管本人执行同操作不受限
 */

function makeAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    userType: 'admin',
    enabled: true,
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    adminProfile: {
      id: 'p1',
      accountId: 'acc-1',
      nickname: 'A',
      email: '',
      phone: '',
      avatar: '',
    },
    adminRoles: [
      {
        id: 'ar1',
        accountId: 'acc-1',
        roleId: 'r-admin',
        role: { id: 'r-admin', code: 'admin', name: '管理员' },
      },
    ],
    identities: [],
    ...overrides,
  };
}

/** 操作者：isSuperAdmin 控制；roleCodes 控制持有的角色 */
function makeOperator(isSuperAdmin: boolean, roleCodes: string[] = ['admin']) {
  return {
    id: 'op-1',
    adminRoles: (isSuperAdmin ? ['super_admin', ...roleCodes] : roleCodes).map(
      (code) => ({
        role: { id: `r-${code}`, code, name: code },
      }),
    ),
  };
}

describe('AdminAccountService', () => {
  let service: AdminAccountService;
  let prisma: {
    client: {
      $transaction: ReturnType<typeof vi.fn>;
      account: {
        findUnique: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
      adminProfile: { update: ReturnType<typeof vi.fn> };
      adminRole: {
        findMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
      };
      adminAccountRole: {
        deleteMany: ReturnType<typeof vi.fn>;
        createMany: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
      adminAccountMenu: {
        findMany: ReturnType<typeof vi.fn>;
        deleteMany: ReturnType<typeof vi.fn>;
      };
    };
    rawClient: {
      $transaction: ReturnType<typeof vi.fn>;
      account: {
        findUnique: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        deleteMany: ReturnType<typeof vi.fn>;
      };
      auditLog: { findFirst: ReturnType<typeof vi.fn> };
      adminAccountMenu: { deleteMany: ReturnType<typeof vi.fn> };
      adminAccountRole: { deleteMany: ReturnType<typeof vi.fn> };
      tokenRevocation: { deleteMany: ReturnType<typeof vi.fn> };
      uploadFile: {
        deleteMany: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
      };
      accountIdentity: { deleteMany: ReturnType<typeof vi.fn> };
      adminProfile: { deleteMany: ReturnType<typeof vi.fn> };
    };
  };
  let tokenBlacklist: { revokeAccountTokens: ReturnType<typeof vi.fn> };
  let audit: { write: ReturnType<typeof vi.fn> };
  let storage: { delete: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      client: {
        $transaction: vi
          .fn<any>()
          .mockImplementation(async (fnOrArr: unknown) => {
            if (typeof fnOrArr === 'function') {
              return fnOrArr(prisma.client);
            }
            return fnOrArr;
          }),
        account: {
          findUnique: vi.fn<any>().mockResolvedValue(makeAccountRow()),
          findMany: vi.fn<any>().mockResolvedValue([makeAccountRow()]),
          update: vi.fn<any>().mockResolvedValue(makeAccountRow()),
          delete: vi.fn<any>().mockResolvedValue(makeAccountRow()),
          count: vi.fn<any>().mockResolvedValue(1),
        },
        adminProfile: { update: vi.fn<any>().mockResolvedValue({}) },
        adminRole: {
          findMany: vi
            .fn<any>()
            .mockImplementation(async (...args: unknown[]) => {
              const a = args[0] as { where?: { code?: { in?: string[] } } };
              return (a.where?.code?.in ?? []).map((code) => ({
                id: `r-${code}`,
              }));
            }),
          findUnique: vi
            .fn<any>()
            .mockResolvedValue({ id: 'r-super_admin', code: 'super_admin' }),
        },
        adminAccountRole: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
          createMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
          // assertSuperAdminRemains 用 adminAccountRole.count 判断是否还有其他启用超管；
          // 默认 1（存在其他超管），「最后一个超管」用例里覆盖为 0
          count: vi.fn<any>().mockResolvedValue(1),
        },
        adminAccountMenu: {
          findMany: vi.fn<any>().mockResolvedValue([]),
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
      },
      rawClient: {
        $transaction: vi
          .fn<any>()
          .mockImplementation(async (fnOrArr: unknown) => {
            if (typeof fnOrArr === 'function') {
              return fnOrArr(prisma.rawClient);
            }
            return fnOrArr;
          }),
        account: {
          findUnique: vi.fn<any>().mockResolvedValue(makeAccountRow()),
          update: vi.fn<any>().mockResolvedValue(makeAccountRow()),
          delete: vi.fn<any>().mockResolvedValue(makeAccountRow()),
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
        auditLog: { findFirst: vi.fn<any>().mockResolvedValue(null) },
        adminAccountMenu: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
        adminAccountRole: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
        tokenRevocation: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
        uploadFile: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
          findMany: vi.fn<any>().mockResolvedValue([]),
        },
        accountIdentity: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
        adminProfile: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
      },
    };
    tokenBlacklist = {
      revokeAccountTokens: vi.fn<any>().mockResolvedValue(undefined),
    };
    audit = { write: vi.fn<any>().mockResolvedValue(undefined) };
    storage = { delete: vi.fn<any>().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAccountService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenBlacklistService, useValue: tokenBlacklist },
        { provide: AuditService, useValue: audit },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(AdminAccountService);
  });

  describe('update：超管保护（P1-2）', () => {
    it('非超管移除目标超管账户的 super_admin 角色 → SUPER_ADMIN_DEMOTE_FORBIDDEN', async () => {
      // 调用序列：target findUnique → loadOperatorRoles(roleCodes 校验) → loadOperatorRoles(超管保护)
      prisma.client.account.findUnique
        .mockResolvedValueOnce(
          makeAccountRow({
            enabled: true,
            adminRoles: [
              {
                id: 'ar1',
                accountId: 'acc-1',
                roleId: 'r-super_admin',
                role: { code: 'super_admin' },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(makeOperator(false, ['admin']))
        .mockResolvedValueOnce(makeOperator(false, ['admin']));

      await expect(
        service.update('acc-1', { roleCodes: ['admin'] }, 'op-1'),
      ).rejects.toMatchObject({ code: 'SUPER_ADMIN_DEMOTE_FORBIDDEN' });
      expect(prisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('非超管禁用超管账户 → SUPER_ADMIN_DEMOTE_FORBIDDEN', async () => {
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeAccountRow({
          enabled: true,
          adminRoles: [
            {
              id: 'ar1',
              accountId: 'acc-1',
              roleId: 'r-super_admin',
              role: { code: 'super_admin' },
            },
          ],
        }),
      );
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(false, ['admin']),
      );

      await expect(
        service.update('acc-1', { enabled: false }, 'op-1'),
      ).rejects.toMatchObject({ code: 'SUPER_ADMIN_DEMOTE_FORBIDDEN' });
    });

    it('非超管授予 super_admin 角色 → SUPER_ADMIN_ASSIGN_FORBIDDEN（防提权）', async () => {
      prisma.client.account.findUnique.mockResolvedValueOnce(makeAccountRow());
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(false, ['admin']),
      );

      await expect(
        service.update('acc-1', { roleCodes: ['super_admin'] }, 'op-1'),
      ).rejects.toMatchObject({ code: 'SUPER_ADMIN_ASSIGN_FORBIDDEN' });
    });

    it('非超管授予自己未持有的角色 → ROLE_ASSIGN_FORBIDDEN', async () => {
      prisma.client.account.findUnique.mockResolvedValueOnce(makeAccountRow());
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(false, ['admin']),
      );

      await expect(
        service.update('acc-1', { roleCodes: ['admin', 'operator'] }, 'op-1'),
      ).rejects.toMatchObject({ code: 'ROLE_ASSIGN_FORBIDDEN' });
    });

    it('超管降权另一个超管（仍有其他超管）→ 允许', async () => {
      prisma.client.account.findUnique
        .mockResolvedValueOnce(
          makeAccountRow({
            enabled: true,
            adminRoles: [
              {
                id: 'ar1',
                accountId: 'acc-1',
                roleId: 'r-super_admin',
                role: { code: 'super_admin' },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(makeOperator(true))
        .mockResolvedValueOnce(makeOperator(true));

      await service.update('acc-1', { roleCodes: ['admin'] }, 'op-1');

      expect(prisma.client.$transaction).toHaveBeenCalled();
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: AUDIT_ACTIONS.ACCOUNT_UPDATED }),
      );
    });

    it('超管禁用最后一个启用超管 → SUPER_ADMIN_PROTECTED', async () => {
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeAccountRow({
          enabled: true,
          adminRoles: [
            {
              id: 'ar1',
              accountId: 'acc-1',
              roleId: 'r-super_admin',
              role: { code: 'super_admin' },
            },
          ],
        }),
      );
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(true),
      );
      // 无其他启用超管
      prisma.client.adminAccountRole.count.mockResolvedValue(0);

      await expect(
        service.update('acc-1', { enabled: false }, 'op-1'),
      ).rejects.toMatchObject({ code: 'SUPER_ADMIN_PROTECTED' });
    });
  });

  describe('remove / hardRemove：超管保护（P1-2）', () => {
    it('非超管软删超管账户 → SUPER_ADMIN_DEMOTE_FORBIDDEN', async () => {
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeAccountRow({
          adminRoles: [
            {
              id: 'ar1',
              accountId: 'acc-1',
              roleId: 'r-super_admin',
              role: { code: 'super_admin' },
            },
          ],
        }),
      );
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(false, ['admin']),
      );

      await expect(service.remove('acc-1', 'op-1')).rejects.toMatchObject({
        code: 'SUPER_ADMIN_DEMOTE_FORBIDDEN',
      });
    });

    it('超管软删超管账户（仍有其他超管）→ 允许', async () => {
      prisma.client.account.findUnique
        .mockResolvedValueOnce(
          makeAccountRow({
            adminRoles: [
              {
                id: 'ar1',
                accountId: 'acc-1',
                roleId: 'r-super_admin',
                role: { code: 'super_admin' },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(makeOperator(true));

      await service.remove('acc-1', 'op-1');

      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: AUDIT_ACTIONS.ACCOUNT_DELETED }),
      );
    });

    it('非超管硬删超管账户 → SUPER_ADMIN_DEMOTE_FORBIDDEN', async () => {
      prisma.rawClient.account.findUnique.mockResolvedValueOnce(
        makeAccountRow({
          adminRoles: [
            {
              id: 'ar1',
              accountId: 'acc-1',
              roleId: 'r-super_admin',
              role: { code: 'super_admin' },
            },
          ],
        }),
      );
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(false, ['admin']),
      );

      await expect(service.hardRemove('acc-1', 'op-1')).rejects.toMatchObject({
        code: 'SUPER_ADMIN_DEMOTE_FORBIDDEN',
      });
    });

    it('超管硬删超管账户（仍有其他超管）→ 允许', async () => {
      prisma.rawClient.account.findUnique.mockResolvedValueOnce(
        makeAccountRow({
          adminRoles: [
            {
              id: 'ar1',
              accountId: 'acc-1',
              roleId: 'r-super_admin',
              role: { code: 'super_admin' },
            },
          ],
        }),
      );
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(true),
      );
      prisma.client.account.count.mockResolvedValue(1);

      await service.hardRemove('acc-1', 'op-1');

      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: AUDIT_ACTIONS.ACCOUNT_HARD_DELETED }),
      );
    });

    it('硬删时清理该账户上传文件的物理文件（P3 #8 修复）', async () => {
      prisma.rawClient.account.findUnique.mockResolvedValueOnce(
        makeAccountRow({ enabled: true }),
      );
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(true),
      );
      prisma.rawClient.uploadFile.findMany.mockResolvedValueOnce([
        { storedName: 'a.png', url: '/uploads/avatars/a.png' },
        { storedName: 'b.pdf', url: '/uploads/files/b.pdf' },
      ]);

      await service.hardRemove('acc-1', 'op-1');

      expect(storage.delete).toHaveBeenCalledTimes(2);
      expect(storage.delete).toHaveBeenCalledWith({
        storedName: 'a.png',
        folder: 'avatars',
      });
      expect(storage.delete).toHaveBeenCalledWith({
        storedName: 'b.pdf',
        folder: 'files',
      });
    });

    it('硬删时物理文件删除失败不阻塞（告警后照常删元数据）', async () => {
      prisma.rawClient.account.findUnique.mockResolvedValueOnce(
        makeAccountRow({ enabled: true }),
      );
      prisma.client.account.findUnique.mockResolvedValueOnce(
        makeOperator(true),
      );
      prisma.rawClient.uploadFile.findMany.mockResolvedValueOnce([
        { storedName: 'a.png', url: '/uploads/files/a.png' },
      ]);
      storage.delete.mockRejectedValueOnce(new Error('disk full'));

      await expect(service.hardRemove('acc-1', 'op-1')).resolves.toBeTruthy();
      // 元数据事务仍执行（rawClient.$transaction 被调用）
      expect(prisma.rawClient.$transaction).toHaveBeenCalled();
    });
  });

  describe('非超管账户操作普通管理员（无超管保护触发）', () => {
    it('非超管更新普通管理员资料（不含角色/启用变更）→ 允许', async () => {
      prisma.client.account.findUnique.mockResolvedValue(makeAccountRow());

      await service.update('acc-1', { nickname: '新名字' }, 'op-1');

      expect(prisma.client.$transaction).toHaveBeenCalled();
    });
  });
});
