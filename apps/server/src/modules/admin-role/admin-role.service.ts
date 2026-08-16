import { Injectable } from '@nestjs/common';
import { BizException, newId } from '@starter/server-core';
import { CreateRoleSchema, UpdateRoleSchema } from '@starter/contracts';
import type { AdminRole, CreateRoleInput, UpdateRoleInput } from '@starter/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

/** Prisma 唯一约束冲突检测（P2002） */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

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
        throw new BizException({ code: 'ROLE_CODE_EXISTS', message: '角色编码已存在' });
      }
      throw error;
    }
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ROLE_CREATED,
      resourceType: 'admin_role',
      resourceId: roleId,
      detail: { roleId, code: data.code },
    });
    return this.findById(roleId);
  }

  async update(id: string, input: UpdateRoleInput, operatorId: string): Promise<AdminRole> {
    const data = UpdateRoleSchema.parse(input);
    const role = await this.prisma.client.adminRole.findUnique({ where: { id } });
    if (!role) {
      throw new BizException({ code: 'ROLE_NOT_FOUND', message: '角色不存在' });
    }
    // super_admin 不允许禁用（防止锁死系统）
    if (role.code === 'super_admin' && data.enabled === false) {
      throw new BizException({ code: 'SUPER_ADMIN_PROTECTED', message: '内置超管角色不允许禁用' });
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.adminRole.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
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
      resourceType: 'admin_role',
      resourceId: id,
      detail: { roleId: id, code: role.code },
    });
    return this.findById(id);
  }

  async remove(id: string, operatorId: string): Promise<AdminRole> {
    const role = await this.prisma.client.adminRole.findUnique({ where: { id } });
    if (!role) {
      throw new BizException({ code: 'ROLE_NOT_FOUND', message: '角色不存在' });
    }
    if (role.code === 'super_admin') {
      throw new BizException({ code: 'SUPER_ADMIN_PROTECTED', message: '内置超管角色不允许删除' });
    }
    // 有账户绑定时不允许删除
    const boundCount = await this.prisma.client.adminAccountRole.count({ where: { roleId: id } });
    if (boundCount > 0) {
      throw new BizException({ code: 'ROLE_IN_USE', message: '该角色已绑定账户，无法删除' });
    }
    await this.prisma.client.$transaction([
      this.prisma.client.adminRoleMenu.deleteMany({ where: { roleId: id } }),
      this.prisma.client.adminRole.delete({ where: { id } }),
    ]);
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.ROLE_DELETED,
      resourceType: 'admin_role',
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
      throw new BizException({ code: 'PERMISSION_NOT_FOUND', message: '存在无效的权限点编码' });
    }
    await tx.adminRoleMenu.createMany({
      data: menus.map((menu) => ({ id: newId(), roleId, menuId: menu.id })),
    });
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
