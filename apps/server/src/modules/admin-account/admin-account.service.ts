import { Injectable } from '@nestjs/common';
import { BizException, newId } from '@starter/server-core';
import {
  CreateAdminAccountSchema,
  SaveAccountMenusSchema,
  UpdateAdminAccountSchema,
} from '@starter/contracts';
import type {
  AccountMenusResult,
  AccountMenuType,
  AdminAccount,
  CreateAdminAccountInput,
  PaginatedData,
  SaveAccountMenusInput,
  UpdateAdminAccountInput,
} from '@starter/contracts';
import bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenBlacklistService } from '../auth/token-blacklist.service.js';

/** Prisma 唯一约束冲突检测（P2002） */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

/** Prisma 账户行（含 profile/roles/identity）→ AdminAccount */
function toAdminAccount(row: {
  id: string;
  enabled: boolean;
  createdAt: Date;
  adminProfile: { nickname: string; email: string; avatar: string } | null;
  adminRoles: { role: { code: string } }[];
  identities: { identityType: string; identifier: string }[];
}): AdminAccount {
  const usernameIdentity = row.identities.find((i) => i.identityType === 'username');
  return {
    accountId: row.id,
    username: usernameIdentity?.identifier ?? '',
    nickname: row.adminProfile?.nickname ?? '',
    email: row.adminProfile?.email ?? '',
    avatar: row.adminProfile?.avatar ?? '',
    enabled: row.enabled,
    roleCodes: row.adminRoles.map((r) => r.role.code).sort(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * 管理端账户管理（阶段 3 扩展）：
 * - 列表/创建/更新/删除管理员账户（Account + Identity + Profile + 角色）
 * - 创建/更新走事务；删除为软删并撤销其 token
 * - 用户名唯一冲突映射为业务错误
 */
@Injectable()
export class AdminAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  private readonly accountInclude = {
    adminProfile: true,
    adminRoles: { include: { role: true } },
    identities: true,
  } as const;

  async list(query: { page: number; pageSize: number }): Promise<PaginatedData<AdminAccount>> {
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.account.findMany({
        where: { userType: 'admin' },
        include: this.accountInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.account.count({ where: { userType: 'admin', deletedAt: null } }),
    ]);
    return {
      items: rows.map(toAdminAccount),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(input: CreateAdminAccountInput): Promise<AdminAccount> {
    const data = CreateAdminAccountSchema.parse(input);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const accountId = newId();
    const roleRows = await this.prisma.client.adminRole.findMany({
      where: { code: { in: data.roleCodes }, enabled: true },
      select: { id: true, code: true },
    });
    if (roleRows.length !== data.roleCodes.length) {
      throw new BizException({ code: 'ROLE_NOT_FOUND', message: '存在无效的角色编码' });
    }

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.account.create({
          data: { id: accountId, userType: 'admin', enabled: true },
        });
        await tx.accountIdentity.create({
          data: {
            id: newId(),
            accountId,
            identityType: 'username',
            identifier: data.username,
            credential: passwordHash,
            verified: true,
          },
        });
        await tx.adminProfile.create({
          data: {
            id: newId(),
            accountId,
            nickname: data.nickname ?? data.username,
            email: data.email ?? '',
          },
        });
        await tx.adminAccountRole.createMany({
          data: roleRows.map((role) => ({ id: newId(), accountId, roleId: role.id })),
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BizException({ code: 'USERNAME_EXISTS', message: '用户名已存在' });
      }
      throw error;
    }

    return this.findById(accountId);
  }

  async update(id: string, input: UpdateAdminAccountInput): Promise<AdminAccount> {
    const data = UpdateAdminAccountSchema.parse(input);
    const account = await this.prisma.client.account.findUnique({ where: { id } });
    if (!account || account.userType !== 'admin') {
      throw new BizException({ code: 'ACCOUNT_NOT_FOUND', message: '账户不存在' });
    }

    await this.prisma.client.$transaction(async (tx) => {
      // 档案与启用状态
      await tx.adminProfile.update({
        where: { accountId: id },
        data: {
          ...(data.nickname !== undefined ? { nickname: data.nickname } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
        },
      });
      if (data.enabled !== undefined) {
        await tx.account.update({ where: { id }, data: { enabled: data.enabled } });
      }
      // 角色重建
      if (data.roleCodes !== undefined) {
        const roleRows = await tx.adminRole.findMany({
          where: { code: { in: data.roleCodes }, enabled: true },
          select: { id: true },
        });
        if (roleRows.length !== data.roleCodes.length) {
          throw new BizException({ code: 'ROLE_NOT_FOUND', message: '存在无效的角色编码' });
        }
        await tx.adminAccountRole.deleteMany({ where: { accountId: id } });
        await tx.adminAccountRole.createMany({
          data: roleRows.map((role) => ({ id: newId(), accountId: id, roleId: role.id })),
        });
      }
    });

    return this.findById(id);
  }

  /** 删除（软删 + 清理角色绑定 + 撤销 token） */
  async remove(id: string): Promise<AdminAccount> {
    const account = await this.prisma.client.account.findUnique({ where: { id } });
    if (!account || account.userType !== 'admin') {
      throw new BizException({ code: 'ACCOUNT_NOT_FOUND', message: '账户不存在' });
    }
    await this.prisma.client.$transaction(async (tx) => {
      // softDeleteExtension 将 delete 改写为软删；角色绑定一并清除，
      // 避免已删除账户仍占用角色（角色删除时的 ROLE_IN_USE 校验按真实绑定计数）
      await tx.account.delete({ where: { id } });
      await tx.adminAccountRole.deleteMany({ where: { accountId: id } });
      await tx.adminAccountMenu.deleteMany({ where: { accountId: id } });
    });
    // 撤销该账户所有 token（tokenVersion 自增）
    await this.tokenBlacklist.revokeAccountTokens(id, 'account_deleted');
    return toAdminAccount({
      ...account,
      adminProfile: null,
      adminRoles: [],
      identities: [],
    });
  }

  /** 读取账户特例授权：已有覆盖 + 角色基线菜单 id（只读展示） */
  async getAccountMenus(accountId: string): Promise<AccountMenusResult> {
    const account = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      include: {
        adminRoles: { include: { role: { include: { roleMenus: true } } } },
      },
    });
    if (!account) {
      throw new BizException({ code: 'ACCOUNT_NOT_FOUND', message: '账户不存在' });
    }
    const overrides = await this.prisma.client.adminAccountMenu.findMany({
      where: { accountId },
      select: { menuId: true, type: true },
    });
    // 角色基线：账户角色绑定的全部菜单 id（去重）
    const roleMenuIds = [
      ...new Set(
        account.adminRoles.flatMap((r) => r.role.roleMenus.map((rm) => rm.menuId)),
      ),
    ];
    return {
      overrides: overrides.map((o) => ({ menuId: o.menuId, type: o.type as AccountMenuType })),
      roleMenuIds,
    };
  }

  /** 保存账户特例授权（全量覆盖：先删后建） */
  async saveAccountMenus(accountId: string, input: SaveAccountMenusInput): Promise<AccountMenusResult> {
    const data = SaveAccountMenusSchema.parse(input);
    const account = await this.prisma.client.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new BizException({ code: 'ACCOUNT_NOT_FOUND', message: '账户不存在' });
    }
    // 校验菜单存在（menuId 白名单）
    const menuIds = data.items.map((i) => i.menuId);
    if (menuIds.length > 0) {
      const count = await this.prisma.client.adminMenu.count({ where: { id: { in: menuIds } } });
      if (count !== menuIds.length) {
        throw new BizException({ code: 'MENU_NOT_FOUND', message: '存在无效的菜单' });
      }
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.adminAccountMenu.deleteMany({ where: { accountId } });
      if (data.items.length > 0) {
        await tx.adminAccountMenu.createMany({
          data: data.items.map((i) => ({ id: newId(), accountId, menuId: i.menuId, type: i.type })),
        });
      }
    });
    return this.getAccountMenus(accountId);
  }

  private async findById(accountId: string): Promise<AdminAccount> {
    const row = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      include: this.accountInclude,
    });
    if (!row) {
      throw new BizException({ code: 'ACCOUNT_NOT_FOUND', message: '账户不存在' });
    }
    return toAdminAccount(row);
  }
}
