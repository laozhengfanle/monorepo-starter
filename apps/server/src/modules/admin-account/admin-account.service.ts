import { Injectable, Logger } from '@nestjs/common';
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
import { isUniqueConstraintError } from '../../common/prisma/prisma-error.util.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { PasswordPolicyService } from '../system-config/password-policy.service.js';
import { resolveAccountPermissions } from '../auth/account-permission.util.js';
import { AUDIT_ACTIONS, AuditService } from '../auth/audit.service.js';
import { TokenBlacklistService } from '../auth/token-blacklist.service.js';

/** Prisma 账户行（含 profile/roles/identity）→ AdminAccount */
function toAdminAccount(row: {
  id: string;
  enabled: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  adminProfile: { nickname: string; email: string; avatar: string } | null;
  adminRoles: { role: { code: string } }[];
  identities: { identityType: string; identifier: string }[];
}): AdminAccount {
  const usernameIdentity = row.identities.find(
    (i) => i.identityType === 'username',
  );
  return {
    accountId: row.id,
    username: usernameIdentity?.identifier ?? '',
    nickname: row.adminProfile?.nickname ?? '',
    email: row.adminProfile?.email ?? '',
    avatar: row.adminProfile?.avatar ?? '',
    enabled: row.enabled,
    roleCodes: row.adminRoles.map((r) => r.role.code).sort(),
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

/**
 * 管理端账户管理（阶段 3 扩展）：
 * - 列表/创建/更新/删除管理员账户（Account + Identity + Profile + 角色）
 * - 创建/更新走事务；删除为软删并撤销其 token；恢复时还原删除前的角色绑定
 * - 超管保护：至少保留一个「启用且绑定 super_admin」的账户，否则拒绝删除/降级/硬删
 * - 核心操作写审计（ACCOUNT_CREATED/UPDATED/ENABLED/DISABLED/DELETED/RESTORED/HARD_DELETED/ACCOUNT_PERMISSION_CHANGED）
 * - 用户名唯一冲突映射为业务错误
 */
@Injectable()
export class AdminAccountService {
  private readonly logger = new Logger(AdminAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  private readonly accountInclude = {
    adminProfile: true,
    adminRoles: { include: { role: true } },
    identities: true,
  } as const;

  async list(query: {
    page: number;
    pageSize: number;
    /** 按用户名模糊搜索（identityType=username 的 identifier） */
    username?: string;
    /** 按邮箱模糊搜索（admin_profile.email） */
    email?: string;
    /** 按角色编码精确筛选 */
    roleCode?: string;
    /** 状态筛选：true=正常 / false=禁用 */
    enabled?: boolean;
    /** 是否包含已软删记录（软删除视图） */
    includeDeleted?: boolean;
  }): Promise<PaginatedData<AdminAccount>> {
    // includeDeleted=true 走 rawClient（绕过软删过滤）；否则走 client（自动过滤）
    const db = query.includeDeleted
      ? this.prisma.rawClient
      : this.prisma.client;

    // 基础条件：admin 账户（+ 软删过滤由 client 扩展自动处理；rawClient 需显式）
    const where: Record<string, unknown> = { userType: 'admin' };
    if (!query.includeDeleted) {
      where.deletedAt = null;
    }
    if (query.enabled !== undefined) {
      where.enabled = query.enabled;
    }
    if (query.roleCode) {
      // 角色筛选：account 存在角色为指定 code 的绑定（关系字段名 adminRoles → AdminAccountRole）
      where.adminRoles = { some: { role: { code: query.roleCode } } };
    }
    // 用户名/邮箱模糊搜索（关联表）
    if (query.username) {
      where.identities = {
        some: {
          identityType: 'username',
          identifier: { contains: query.username, mode: 'insensitive' },
        },
      };
    }
    if (query.email) {
      where.adminProfile = {
        email: { contains: query.email, mode: 'insensitive' },
      };
    }

    const [rows, total] = await db.$transaction([
      db.account.findMany({
        where,
        include: this.accountInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      db.account.count({ where }),
    ]);
    return {
      items: rows.map(toAdminAccount),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(
    input: CreateAdminAccountInput,
    operatorId: string,
  ): Promise<AdminAccount> {
    const data = CreateAdminAccountSchema.parse(input);
    // 越权防护：非超管操作者不得授予 super_admin 角色或自己未持有的角色（防提权）
    const operator = await this.loadOperatorRoles(operatorId);
    if (!operator.isSuperAdmin) {
      this.assertAssignableRoles(data.roleCodes, operator.roleCodes);
    }
    // 密码策略（后台设置 settings.passwordMinLength / passwordComplexity）
    await this.passwordPolicy.assertValid(data.password);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const accountId = newId();
    const roleRows = await this.prisma.client.adminRole.findMany({
      where: { code: { in: data.roleCodes }, enabled: true },
      select: { id: true, code: true },
    });
    if (roleRows.length !== data.roleCodes.length) {
      throw new BizException({
        code: 'ROLE_NOT_FOUND',
        message: '存在无效的角色编码',
      });
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
          data: roleRows.map((role) => ({
            id: newId(),
            accountId,
            roleId: role.id,
          })),
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BizException({
          code: 'USERNAME_EXISTS',
          message: '用户名已存在',
        });
      }
      throw error;
    }

    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ACCOUNT_CREATED,
      resourceId: accountId,
      detail: { accountId, roleCodes: data.roleCodes },
    });

    return this.findById(accountId);
  }

  async update(
    id: string,
    input: UpdateAdminAccountInput,
    operatorId: string,
  ): Promise<AdminAccount> {
    const data = UpdateAdminAccountSchema.parse(input);
    const account = await this.prisma.client.account.findUnique({
      where: { id },
      include: { adminRoles: { include: { role: true } } },
    });
    if (!account || account.userType !== 'admin') {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }

    // 越权防护：非超管操作者更新角色时，不得授予 super_admin 角色或自己未持有的角色（防提权）
    if (data.roleCodes !== undefined) {
      const operator = await this.loadOperatorRoles(operatorId);
      if (!operator.isSuperAdmin) {
        this.assertAssignableRoles(data.roleCodes, operator.roleCodes);
      }
    }

    // 超管保护：本次更新若使该账户不再是「启用且绑定 super_admin」的账户（移除 super_admin 角色或禁用），
    // 则必须由超管本人操作（防非超管逐个降权/禁用其他管理员），且仍需有其他启用超管兜底
    const currentRoleCodes = account.adminRoles.map((r) => r.role.code);
    const nextEnabled =
      data.enabled !== undefined ? data.enabled : account.enabled;
    const nextRoleCodes =
      data.roleCodes !== undefined ? data.roleCodes : currentRoleCodes;
    const willLoseSuperAdmin =
      account.enabled &&
      currentRoleCodes.includes('super_admin') &&
      (!nextEnabled || !nextRoleCodes.includes('super_admin'));
    if (willLoseSuperAdmin) {
      const operator = await this.loadOperatorRoles(operatorId);
      if (!operator.isSuperAdmin) {
        throw new BizException({
          code: 'SUPER_ADMIN_DEMOTE_FORBIDDEN',
          message: '非超级管理员不得降权或禁用超管账户',
        });
      }
      await this.assertSuperAdminRemains(id);
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
        await tx.account.update({
          where: { id },
          data: { enabled: data.enabled },
        });
      }
      // 角色重建
      if (data.roleCodes !== undefined) {
        const roleRows = await tx.adminRole.findMany({
          where: { code: { in: data.roleCodes }, enabled: true },
          select: { id: true },
        });
        if (roleRows.length !== data.roleCodes.length) {
          throw new BizException({
            code: 'ROLE_NOT_FOUND',
            message: '存在无效的角色编码',
          });
        }
        await tx.adminAccountRole.deleteMany({ where: { accountId: id } });
        await tx.adminAccountRole.createMany({
          data: roleRows.map((role) => ({
            id: newId(),
            accountId: id,
            roleId: role.id,
          })),
        });
      }
    });

    // 审计：更新 + 启用/禁用状态变化 + 角色分配/撤销（resourceType 由 action 映射自动补全）
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
      resourceId: id,
      detail: { accountId: id },
    });
    if (data.enabled !== undefined && data.enabled !== account.enabled) {
      await this.audit.write({
        accountId: operatorId,
        action: data.enabled
          ? AUDIT_ACTIONS.ACCOUNT_ENABLED
          : AUDIT_ACTIONS.ACCOUNT_DISABLED,
        resourceId: id,
        detail: { accountId: id, enabled: data.enabled },
      });
    }
    // 角色 diff：分配（新增角色）/ 撤销（移除角色）各写一条
    if (data.roleCodes !== undefined) {
      const added = nextRoleCodes.filter((c) => !currentRoleCodes.includes(c));
      const removed = currentRoleCodes.filter(
        (c) => !nextRoleCodes.includes(c),
      );
      if (added.length > 0) {
        await this.audit.write({
          accountId: operatorId,
          action: AUDIT_ACTIONS.ROLE_ASSIGNED,
          resourceId: id,
          detail: { accountId: id, roleCodes: added },
        });
      }
      if (removed.length > 0) {
        await this.audit.write({
          accountId: operatorId,
          action: AUDIT_ACTIONS.ROLE_REVOKED,
          resourceId: id,
          detail: { accountId: id, roleCodes: removed },
        });
      }
    }

    return this.findById(id);
  }

  /** 删除（软删 + 清理角色绑定 + 撤销 token；删除前记录 roleIds 供恢复时还原） */
  async remove(id: string, operatorId: string): Promise<AdminAccount> {
    const account = await this.prisma.client.account.findUnique({
      where: { id },
      include: { adminRoles: { include: { role: true } } },
    });
    if (!account || account.userType !== 'admin') {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }
    // 超管保护：删除超管账户必须由超管本人操作（防非超管逐个删除其他管理员），
    // 且不允许删掉最后一个启用且绑定 super_admin 的账户
    const isSuperAdmin = account.adminRoles.some(
      (r) => r.role.code === 'super_admin',
    );
    if (isSuperAdmin) {
      const operator = await this.loadOperatorRoles(operatorId);
      if (!operator.isSuperAdmin) {
        throw new BizException({
          code: 'SUPER_ADMIN_DEMOTE_FORBIDDEN',
          message: '非超级管理员不得删除超管账户',
        });
      }
      await this.assertSuperAdminRemains(id);
    }
    // 记录删除前的角色绑定（restore 时按此还原）
    const roleIds = account.adminRoles.map((r) => r.roleId);

    await this.prisma.client.$transaction(async (tx) => {
      // softDeleteExtension 将 delete 改写为软删；角色绑定一并清除，
      // 避免已删除账户仍占用角色（角色删除时的 ROLE_IN_USE 校验按真实绑定计数）
      await tx.account.delete({ where: { id } });
      await tx.adminAccountRole.deleteMany({ where: { accountId: id } });
      await tx.adminAccountMenu.deleteMany({ where: { accountId: id } });
    });
    // 撤销该账户所有 token（tokenVersion 自增）
    await this.tokenBlacklist.revokeAccountTokens(id, 'account_deleted');
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ACCOUNT_DELETED,
      resourceId: id,
      detail: { accountId: id, roleIds },
    });
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
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }
    const overrides = await this.prisma.client.adminAccountMenu.findMany({
      where: { accountId },
      select: { menuId: true, type: true },
    });
    // 角色基线：账户角色绑定的全部菜单 id（去重）
    const roleMenuIds = [
      ...new Set(
        account.adminRoles.flatMap((r) =>
          r.role.roleMenus.map((rm) => rm.menuId),
        ),
      ),
    ];
    return {
      overrides: overrides.map((o) => ({
        menuId: o.menuId,
        type: o.type as AccountMenuType,
      })),
      roleMenuIds,
    };
  }

  /** 保存账户特例授权（全量覆盖：先删后建） */
  async saveAccountMenus(
    accountId: string,
    input: SaveAccountMenusInput,
    operatorId: string,
  ): Promise<AccountMenusResult> {
    const data = SaveAccountMenusSchema.parse(input);
    const account = await this.prisma.client.account.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }
    // 校验菜单存在（menuId 白名单）
    const menuIds = data.items.map((i) => i.menuId);
    if (menuIds.length > 0) {
      const count = await this.prisma.client.adminMenu.count({
        where: { id: { in: menuIds } },
      });
      if (count !== menuIds.length) {
        throw new BizException({
          code: 'MENU_NOT_FOUND',
          message: '存在无效的菜单',
        });
      }
    }
    // 越权防护：非超管操作者只能 grant/deny 自己已持有的权限点（resolveAccountPermissions 对比）
    await this.assertMenusWithinOwnedPermissions(operatorId, menuIds);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.adminAccountMenu.deleteMany({ where: { accountId } });
      if (data.items.length > 0) {
        await tx.adminAccountMenu.createMany({
          data: data.items.map((i) => ({
            id: newId(),
            accountId,
            menuId: i.menuId,
            type: i.type,
          })),
        });
      }
    });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ACCOUNT_PERMISSION_CHANGED,
      resourceId: accountId,
      detail: { accountId, overrides: data.items },
    });
    return this.getAccountMenus(accountId);
  }

  /** 恢复已软删账户（deletedAt → null；同时按删除时记录的 roleIds 还原角色绑定） */
  async restore(id: string, operatorId: string): Promise<AdminAccount> {
    const account = await this.prisma.rawClient.account.findUnique({
      where: { id },
    });
    if (!account || account.userType !== 'admin' || !account.deletedAt) {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在或未删除',
      });
    }
    // 读取删除时记录的 roleIds（ACCOUNT_DELETED 审计 detail；audit_log.account_id 记录的是操作者，
    // 目标账户在 resource_id 上）
    let roleIds: string[] = [];
    const deletedAudit = await this.prisma.rawClient.auditLog.findFirst({
      where: { resourceId: id, action: AUDIT_ACTIONS.ACCOUNT_DELETED },
      orderBy: { createdAt: 'desc' },
    });
    const recorded = (deletedAudit?.detail as { roleIds?: unknown } | null)
      ?.roleIds;
    if (Array.isArray(recorded)) {
      roleIds = recorded.filter((x): x is string => typeof x === 'string');
    }

    await this.prisma.rawClient.$transaction(async (tx) => {
      await tx.account.update({ where: { id }, data: { deletedAt: null } });
      if (roleIds.length > 0) {
        // 仅绑定仍存在的角色（已被删除的角色无法恢复绑定）
        const roles = await tx.adminRole.findMany({
          where: { id: { in: roleIds } },
          select: { id: true },
        });
        if (roles.length > 0) {
          await tx.adminAccountRole.deleteMany({ where: { accountId: id } });
          await tx.adminAccountRole.createMany({
            data: roles.map((role) => ({
              id: newId(),
              accountId: id,
              roleId: role.id,
            })),
          });
        }
      } else {
        // 未记录（本功能上线前删除的历史数据无法考证原角色）：至少恢复 super_admin 角色，
        // 避免曾为超管的账户恢复后无任何权限导致系统不可用
        const superRole = await tx.adminRole.findUnique({
          where: { code: 'super_admin' },
        });
        if (superRole) {
          await tx.adminAccountRole.deleteMany({ where: { accountId: id } });
          await tx.adminAccountRole.create({
            data: { id: newId(), accountId: id, roleId: superRole.id },
          });
        }
      }
    });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ACCOUNT_RESTORED,
      resourceId: id,
      detail: { accountId: id, roleIds },
    });
    return this.findById(id);
  }

  /** 彻底删除：清级联表后硬删（软删除视图）（rawClient 无软删扩展） */
  async hardRemove(id: string, operatorId: string): Promise<AdminAccount> {
    const account = await this.prisma.rawClient.account.findUnique({
      where: { id },
      include: { adminRoles: { include: { role: true } } },
    });
    if (!account || account.userType !== 'admin') {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }
    // 超管保护：硬删超管账户必须由超管本人操作，且不允许硬删最后一个启用超管
    const isSuperAdmin = account.adminRoles.some(
      (r) => r.role.code === 'super_admin',
    );
    if (isSuperAdmin) {
      const operator = await this.loadOperatorRoles(operatorId);
      if (!operator.isSuperAdmin) {
        throw new BizException({
          code: 'SUPER_ADMIN_DEMOTE_FORBIDDEN',
          message: '非超级管理员不得硬删超管账户',
        });
      }
      await this.assertSuperAdminRemains(id);
    }
    // 审计必须先写（audit_log.account_id 是 FK Restrict，账户行删除后就写不进去了；
    // 且保留该账户的审计痕迹，不随硬删清除）
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ACCOUNT_HARD_DELETED,
      resourceId: id,
      detail: { accountId: id },
    });
    // 物理文件清理（P3 #8 修复）：先取该账户全部上传文件元数据（含已软删行，rawClient 绕过软删过滤），
    // 逐个删物理文件（幂等、失败仅告警不阻塞），再删元数据——避免硬删后遗留孤儿文件占磁盘
    const uploadFiles = await this.prisma.rawClient.uploadFile.findMany({
      where: { accountId: id },
      select: { storedName: true, url: true },
    });
    for (const file of uploadFiles) {
      try {
        await this.storage.delete({
          storedName: file.storedName,
          folder: this.folderFromUrl(file.url),
        });
      } catch (err) {
        // 物理文件删除失败不阻塞账户硬删（元数据照删）；仅告警，防孤儿文件排查时无从下手
        this.logger.warn(
          `硬删账户 ${id} 时清理物理文件失败 (storedName=${file.storedName}): ${(err as Error).message}`,
        );
      }
    }

    await this.prisma.rawClient.$transaction(async (tx) => {
      await tx.adminAccountMenu.deleteMany({ where: { accountId: id } });
      await tx.adminAccountRole.deleteMany({ where: { accountId: id } });
      await tx.tokenRevocation.deleteMany({ where: { accountId: id } });
      // 注意：不删除 auditLog，保留该账户的审计痕迹（含刚写入的 ACCOUNT_HARD_DELETED）
      await tx.uploadFile.deleteMany({ where: { accountId: id } });
      await tx.accountIdentity.deleteMany({ where: { accountId: id } });
      await tx.adminProfile.deleteMany({ where: { accountId: id } });
      await tx.account.delete({ where: { id } });
    });
    return toAdminAccount({
      ...account,
      adminProfile: null,
      adminRoles: [],
      identities: [],
    });
  }

  /** 从 url（/uploads/{folder}/{storedName}）解析 folder；解析失败回退 files（与 file-manager 同语义） */
  private folderFromUrl(url: string): string {
    const parts = url.split('/').filter(Boolean);
    if (parts.length >= 3 && parts[0] === 'uploads') {
      return parts[1]!;
    }
    return 'files';
  }

  /**
   * 读取操作者账户的角色信息（越权校验前置）：
   * - isSuperAdmin：超管不受角色分配限制
   * - roleCodes：操作者当前持有的角色编码（其可分配角色的天花板）
   */
  private async loadOperatorRoles(operatorId: string): Promise<{
    isSuperAdmin: boolean;
    roleCodes: string[];
  }> {
    const operator = await this.prisma.client.account.findUnique({
      where: { id: operatorId },
      include: { adminRoles: { include: { role: true } } },
    });
    if (!operator) {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '操作者账户不存在',
      });
    }
    return {
      isSuperAdmin: operator.adminRoles.some(
        (r) => r.role.code === 'super_admin',
      ),
      roleCodes: operator.adminRoles.map((r) => r.role.code),
    };
  }

  /**
   * 角色分配越权校验：非超管操作者
   * - 不得授予 super_admin 角色（SUPER_ADMIN_ASSIGN_FORBIDDEN）
   * - 不得授予自己未持有的角色（比操作者等级高/未持有的角色一律拒绝，ROLE_ASSIGN_FORBIDDEN）
   */
  private assertAssignableRoles(
    roleCodes: string[],
    operatorRoleCodes: string[],
  ): void {
    if (roleCodes.includes('super_admin')) {
      throw new BizException({
        code: 'SUPER_ADMIN_ASSIGN_FORBIDDEN',
        message: '非超级管理员不得授予 super_admin 角色',
      });
    }
    const forbidden = roleCodes.filter(
      (code) => !operatorRoleCodes.includes(code),
    );
    if (forbidden.length > 0) {
      throw new BizException({
        code: 'ROLE_ASSIGN_FORBIDDEN',
        message: `不能授予自己未持有的角色: ${forbidden.join(', ')}`,
      });
    }
  }

  /**
   * 特例授权越权校验：非超管操作者只能 grant/deny 自己已持有的权限点
   * （与 me()/PermissionGuard 共用 resolveAccountPermissions，保证判定一致），越权即抛。
   */
  private async assertMenusWithinOwnedPermissions(
    operatorId: string,
    menuIds: string[],
  ): Promise<void> {
    if (menuIds.length === 0) {
      return;
    }
    const operator = await this.prisma.client.account.findUnique({
      where: { id: operatorId },
      include: {
        adminRoles: {
          include: {
            role: { include: { roleMenus: { include: { menu: true } } } },
          },
        },
      },
    });
    if (!operator) {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '操作者账户不存在',
      });
    }
    // 超级管理员不受限（可管理任意权限点）
    if (operator.adminRoles.some((r) => r.role.code === 'super_admin')) {
      return;
    }
    const ownedCodes = await resolveAccountPermissions(this.prisma, operator);
    const menus = await this.prisma.client.adminMenu.findMany({
      where: { id: { in: menuIds } },
      select: { id: true, code: true },
    });
    const codeById = new Map(menus.map((m) => [m.id, m.code]));
    const forbidden = menuIds.filter(
      (menuId) => !ownedCodes.has(codeById.get(menuId) ?? ''),
    );
    if (forbidden.length > 0) {
      throw new BizException({
        code: 'PERMISSION_ASSIGN_FORBIDDEN',
        message: '只能授予或禁止自己已持有的权限点',
      });
    }
  }

  /**
   * 超管保护：目标账户是「启用且绑定 super_admin」的账户时，
   * 若系统中已没有其他「启用且绑定 super_admin」的账户，则拒绝删除/降级/硬删，防止权限锁死。
   */
  private async assertSuperAdminRemains(accountId: string): Promise<void> {
    const superAdminRole = await this.prisma.client.adminRole.findUnique({
      where: { code: 'super_admin' },
    });
    if (!superAdminRole) {
      return;
    }
    const otherCount = await this.prisma.client.adminAccountRole.count({
      where: {
        roleId: superAdminRole.id,
        accountId: { not: accountId },
        account: { userType: 'admin', enabled: true, deletedAt: null },
      },
    });
    if (otherCount === 0) {
      throw new BizException({
        code: 'SUPER_ADMIN_PROTECTED',
        message: '系统至少保留一个超级管理员',
      });
    }
  }

  private async findById(accountId: string): Promise<AdminAccount> {
    const row = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      include: this.accountInclude,
    });
    if (!row) {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }
    return toAdminAccount(row);
  }
}
