import { Injectable } from '@nestjs/common';
import { BizException, newId } from '@starter/server-core';
import { CreateRoleSchema, UpdateRoleSchema } from '@starter/contracts';
import type {
  AdminRole,
  CreateRoleInput,
  UpdateRoleInput,
} from '@starter/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { isUniqueConstraintError } from '../../common/prisma/prisma-error.util.js';
import { resolveAccountPermissions } from '../auth/account-permission.util.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

/** Prisma 角色行（含权限点）→ AdminRole */
function toAdminRole(row: {
  id: string;
  name: string;
  code: string;
  description: string;
  enabled: boolean;
  createdAt: Date;
  roleMenus: { menu: { code: string } }[];
}): AdminRole {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    enabled: row.enabled,
    permissionCodes: row.roleMenus.map((rm) => rm.menu.code).sort(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * 角色管理（阶段 3 权限闭环）：
 * - CRUD 角色 + 权限点分配（AdminRoleMenu 绑定）
 * - 内置 super_admin 角色不允许删除/禁用（防止锁死系统）
 * - 越权护栏（P1-1）：非超管只能管理自己持有的角色，且授予的权限点 ⊆ 自己已持有
 * - 核心操作写审计（ROLE_CREATED / ROLE_UPDATED / ROLE_DELETED）
 */
@Injectable()
export class AdminRoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly roleInclude = {
    roleMenus: { include: { menu: true } },
  } as const;

  async list(): Promise<AdminRole[]> {
    const rows = await this.prisma.client.adminRole.findMany({
      include: this.roleInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAdminRole);
  }

  async create(input: CreateRoleInput, operatorId: string): Promise<AdminRole> {
    const data = CreateRoleSchema.parse(input);
    // 越权护栏：非超管只能创建「权限点 ⊆ 自己已持有」的角色（封堵借角色编辑自我提权）
    await this.assertRoleMutationAllowed(operatorId, {
      targetRoleCode: data.code,
      permissionCodes: data.permissionCodes,
    });
    const roleId = newId();
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.adminRole.create({
          data: {
            id: roleId,
            name: data.name,
            code: data.code,
            description: data.description ?? '',
          },
        });
        if (data.permissionCodes?.length) {
          await this.bindPermissions(tx, roleId, data.permissionCodes);
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BizException({
          code: 'ROLE_CODE_EXISTS',
          message: '角色编码已存在',
        });
      }
      throw error;
    }
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ROLE_CREATED,
      resourceId: roleId,
      detail: { roleId, code: data.code },
    });
    return this.findById(roleId);
  }

  async update(
    id: string,
    input: UpdateRoleInput,
    operatorId: string,
  ): Promise<AdminRole> {
    const data = UpdateRoleSchema.parse(input);
    const role = await this.prisma.client.adminRole.findUnique({
      where: { id },
      include: { roleMenus: { include: { menu: true } } },
    });
    if (!role) {
      throw new BizException({ code: 'ROLE_NOT_FOUND', message: '角色不存在' });
    }
    // 越权护栏：非超管只能修改自己持有的角色，且权限点 ⊆ 自己已持有
    await this.assertRoleMutationAllowed(operatorId, {
      targetRoleId: role.id,
      targetRoleCode: role.code,
      permissionCodes: data.permissionCodes,
    });
    // super_admin 不允许禁用（防止锁死系统）
    if (role.code === 'super_admin' && data.enabled === false) {
      throw new BizException({
        code: 'SUPER_ADMIN_PROTECTED',
        message: '内置超管角色不允许禁用',
      });
    }
    // 权限点 diff 基准：更新前的权限点编码
    const prevPermissionCodes = role.roleMenus.map((rm) => rm.menu.code).sort();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.adminRole.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        },
      });
      if (data.permissionCodes !== undefined) {
        await tx.adminRoleMenu.deleteMany({ where: { roleId: id } });
        if (data.permissionCodes.length > 0) {
          await this.bindPermissions(tx, id, data.permissionCodes);
        }
      }
    });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      resourceId: id,
      detail: { roleId: id, code: role.code },
    });
    // 权限点变更审计（仅当本次显式更新了权限点且与旧值不同）
    if (data.permissionCodes !== undefined) {
      const nextPermissionCodes = [...data.permissionCodes].sort();
      const changed =
        nextPermissionCodes.length !== prevPermissionCodes.length ||
        nextPermissionCodes.some((c, i) => c !== prevPermissionCodes[i]);
      if (changed) {
        await this.audit.write({
          accountId: operatorId,
          action: AUDIT_ACTIONS.PERMISSION_CHANGED,
          resourceId: id,
          detail: {
            roleId: id,
            code: role.code,
            permissionCodes: nextPermissionCodes,
          },
        });
      }
    }
    return this.findById(id);
  }

  async remove(id: string, operatorId: string): Promise<AdminRole> {
    const role = await this.prisma.client.adminRole.findUnique({
      where: { id },
    });
    if (!role) {
      throw new BizException({ code: 'ROLE_NOT_FOUND', message: '角色不存在' });
    }
    // 越权护栏：非超管只能删除自己持有的角色（超管角色另有 code 保护）
    await this.assertRoleMutationAllowed(operatorId, {
      targetRoleId: role.id,
      targetRoleCode: role.code,
    });
    if (role.code === 'super_admin') {
      throw new BizException({
        code: 'SUPER_ADMIN_PROTECTED',
        message: '内置超管角色不允许删除',
      });
    }
    // 有账户绑定时不允许删除
    const boundCount = await this.prisma.client.adminAccountRole.count({
      where: { roleId: id },
    });
    if (boundCount > 0) {
      throw new BizException({
        code: 'ROLE_IN_USE',
        message: '该角色已绑定账户，无法删除',
      });
    }
    await this.prisma.client.$transaction([
      this.prisma.client.adminRoleMenu.deleteMany({ where: { roleId: id } }),
      this.prisma.client.adminRole.delete({ where: { id } }),
    ]);
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ROLE_DELETED,
      resourceId: id,
      detail: { roleId: id, code: role.code },
    });
    return toAdminRole({ ...role, roleMenus: [] });
  }

  /** 校验权限点存在后绑定（事务内） */
  private async bindPermissions(
    tx: Parameters<Parameters<typeof this.prisma.client.$transaction>[0]>[0],
    roleId: string,
    codes: string[],
  ): Promise<void> {
    const menus = await tx.adminMenu.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });
    if (menus.length !== codes.length) {
      throw new BizException({
        code: 'PERMISSION_NOT_FOUND',
        message: '存在无效的权限点编码',
      });
    }
    await tx.adminRoleMenu.createMany({
      data: menus.map((menu) => ({ id: newId(), roleId, menuId: menu.id })),
    });
  }

  /**
   * 角色操作越权校验（P1-1 修复，对齐 admin-account 的 assertAssignableRoles 语义）：
   * - 超管（super_admin 角色）不受限；
   * - 非超管：
   *   1) 目标角色 code 为 super_admin → 拒绝（内置超管角色仅超管可管理）；
   *   2) 修改/删除目标角色必须自己已持有该角色；
   *   3) 本次写入的权限点必须 ⊆ 自己已持有（resolveAccountPermissions，含特例授权覆盖），
   *      封堵「给自己角色添加任意权限点 → 自我提权」与「篡改他人角色」。
   */
  private async assertRoleMutationAllowed(
    operatorId: string,
    opts: {
      /** 目标角色 id（create 时目标尚不存在，传 undefined） */
      targetRoleId?: string;
      /** 目标角色 code（update/remove 为现有角色；create 为新角色 code） */
      targetRoleCode?: string;
      /** 本次将写入的权限点（create/update 的 permissionCodes） */
      permissionCodes?: string[];
    },
  ): Promise<void> {
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
        code: 'ROLE_MANAGE_FORBIDDEN',
        message: '操作者账户不存在',
      });
    }
    const isSuperAdmin = operator.adminRoles.some(
      (r) => r.role.code === 'super_admin',
    );
    if (isSuperAdmin) {
      return;
    }
    if (opts.targetRoleCode === 'super_admin') {
      throw new BizException({
        code: 'ROLE_MANAGE_FORBIDDEN',
        message: '非超级管理员不得管理内置超管角色',
      });
    }
    if (opts.targetRoleId) {
      const holdsRole = operator.adminRoles.some(
        (r) => r.role.id === opts.targetRoleId,
      );
      if (!holdsRole) {
        throw new BizException({
          code: 'ROLE_MANAGE_FORBIDDEN',
          message: '只能管理自己持有的角色',
        });
      }
    }
    if (opts.permissionCodes?.length) {
      const owned = await resolveAccountPermissions(this.prisma, operator);
      const forbidden = opts.permissionCodes.filter((code) => !owned.has(code));
      if (forbidden.length > 0) {
        throw new BizException({
          code: 'ROLE_PERMISSION_FORBIDDEN',
          message: `不能授予自己未持有的权限点: ${forbidden.join(', ')}`,
        });
      }
    }
  }

  private async findById(id: string): Promise<AdminRole> {
    const row = await this.prisma.client.adminRole.findUnique({
      where: { id },
      include: this.roleInclude,
    });
    if (!row) {
      throw new BizException({ code: 'ROLE_NOT_FOUND', message: '角色不存在' });
    }
    return toAdminRole(row);
  }
}
