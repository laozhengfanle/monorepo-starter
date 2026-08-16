import { Injectable } from '@nestjs/common';
import { BizException, newId } from '@starter/server-core';
import { CreateMenuSchema, UpdateMenuSchema } from '@starter/contracts';
import type { AdminMenuNode, CreateMenuInput, UpdateMenuInput } from '@starter/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';
import { buildMenuTree, type MenuRow } from './menu-tree.util.js';

/** Prisma 唯一约束冲突检测（P2002） */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

/** Prisma 菜单行 → AdminMenuNode（无子节点） */
function toNode(row: MenuRow): AdminMenuNode {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    type: row.type as AdminMenuNode['type'],
    path: row.path,
    icon: row.icon,
    sort: row.sort,
    enabled: row.enabled,
    visible: row.visible,
    createdAt: row.createdAt.toISOString(),
    children: [],
  };
}

/**
 * 菜单/权限点管理（菜单与权限同一张表）：
 * - 树形结构：目录(directory) → 菜单(menu，有 path) → 按钮(button，权限点)
 * - 删除限制：存在子节点不允许删除；删除同时清理角色绑定与账户特例授权覆盖（admin_account_menu）
 * - 编码唯一（P2002 → MENU_CODE_EXISTS）
 * - 核心操作写审计（MENU_CREATED / MENU_UPDATED / MENU_DELETED）
 */
@Injectable()
export class AdminMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 完整菜单树（菜单管理页使用） */
  async listTree(): Promise<AdminMenuNode[]> {
    const rows = await this.prisma.client.adminMenu.findMany({
      orderBy: { sort: 'asc' },
    });
    return buildMenuTree(rows, null);
  }

  async create(input: CreateMenuInput, operatorId: string): Promise<AdminMenuNode> {
    const data = CreateMenuSchema.parse(input);
    await this.validateParent(data.parentId ?? null, data.type);
    try {
      const row = await this.prisma.client.adminMenu.create({
        data: {
          id: newId(),
          parentId: data.parentId ?? null,
          name: data.name,
          code: data.code,
          type: data.type,
          // path 仅 menu 类型有效
          path: data.type === 'menu' ? (data.path ?? null) : null,
          icon: data.icon ?? null,
          sort: data.sort ?? 0,
          visible: data.visible ?? true,
        },
      });
      await this.audit.write({
        accountId: operatorId,
        action: AUDIT_ACTIONS.MENU_CREATED,
          resourceId: row.id,
        detail: { menuId: row.id, code: row.code },
      });
      return toNode(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BizException({ code: 'MENU_CODE_EXISTS', message: '菜单编码已存在' });
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateMenuInput, operatorId: string): Promise<AdminMenuNode> {
    const data = UpdateMenuSchema.parse(input);
    const existing = await this.prisma.client.adminMenu.findUnique({ where: { id } });
    if (!existing) {
      throw new BizException({ code: 'MENU_NOT_FOUND', message: '菜单不存在' });
    }
    if (data.parentId === id) {
      throw new BizException({ code: 'MENU_PARENT_SELF', message: '不能将菜单挂到自身' });
    }
    if (data.parentId) {
      await this.ensureNotDescendant(id, data.parentId);
    }
    if (data.type && data.parentId !== undefined) {
      await this.validateParent(data.parentId ?? null, data.type);
    }

    const row = await this.prisma.client.adminMenu.update({
      where: { id },
      data: {
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.path !== undefined ? { path: data.type === 'menu' ? data.path : null } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.visible !== undefined ? { visible: data.visible } : {}),
      },
    });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.MENU_UPDATED,
      resourceId: id,
      detail: { menuId: id, code: row.code },
    });
    return toNode(row);
  }

  async remove(id: string, operatorId: string): Promise<AdminMenuNode> {
    const existing = await this.prisma.client.adminMenu.findUnique({ where: { id } });
    if (!existing) {
      throw new BizException({ code: 'MENU_NOT_FOUND', message: '菜单不存在' });
    }
    const childCount = await this.prisma.client.adminMenu.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BizException({ code: 'MENU_HAS_CHILDREN', message: '存在子菜单，请先删除子菜单' });
    }
    // 同步清理关联（顺序不能乱，admin_account_menu.menu_id / admin_role_menu.menu_id 均为 FK Restrict）：
    // 1) 账户特例授权覆盖（grant/deny）2) 角色-菜单绑定 3) 菜单本身
    await this.prisma.client.$transaction([
      this.prisma.client.adminAccountMenu.deleteMany({ where: { menuId: id } }),
      this.prisma.client.adminRoleMenu.deleteMany({ where: { menuId: id } }),
      this.prisma.client.adminMenu.delete({ where: { id } }),
    ]);
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.MENU_DELETED,
      resourceId: id,
      detail: { menuId: id, code: existing.code },
    });
    return toNode(existing);
  }

  /** 父节点校验：button 只能挂 menu 下，menu/directory 只能挂 directory 下 */
  private async validateParent(parentId: string | null, type: string): Promise<void> {
    if (!parentId) return;
    const parent = await this.prisma.client.adminMenu.findUnique({ where: { id: parentId } });
    if (!parent) {
      throw new BizException({ code: 'MENU_PARENT_NOT_FOUND', message: '父菜单不存在' });
    }
    const valid = type === 'button' ? parent.type === 'menu' : parent.type === 'directory';
    if (!valid) {
      throw new BizException({
        code: 'MENU_PARENT_INVALID',
        message: type === 'button' ? '按钮只能挂在菜单下' : '菜单/目录只能挂在目录下',
      });
    }
  }

  /** 防止把菜单挂到自己的后代上（沿 parentId 向上走到 id 即环） */
  private async ensureNotDescendant(id: string, parentId: string): Promise<void> {
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === id) {
        throw new BizException({ code: 'MENU_PARENT_DESCENDANT', message: '不能将菜单挂到自己的子菜单下' });
      }
      const parent: { parentId: string | null } | null =
        await this.prisma.client.adminMenu.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = parent?.parentId ?? null;
    }
  }
}
