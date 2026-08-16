import { Injectable } from '@nestjs/common';
import { BizException, newId } from '@starter/server-core';
import {
  CreateDictItemSchema,
  CreateDictTypeSchema,
  UpdateDictItemSchema,
  UpdateDictTypeSchema,
} from '@starter/contracts';
import type { SysDictItem, SysDictType } from '@starter/contracts';
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

/** 字典项行 → 契约 */
function toItem(row: {
  id: string;
  label: string;
  value: string;
  remark: string | null;
  enabled: boolean;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
}): SysDictItem {
  return {
    id: row.id,
    label: row.label,
    value: row.value,
    remark: row.remark,
    enabled: row.enabled,
    sort: row.sort,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 字典类型行（含 items）→ 契约 */
function toType(row: {
  id: string;
  code: string;
  name: string;
  remark: string | null;
  enabled: boolean;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    label: string;
    value: string;
    remark: string | null;
    enabled: boolean;
    sort: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
}): SysDictType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    remark: row.remark,
    enabled: row.enabled,
    sort: row.sort,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map(toItem).sort((a, b) => a.sort - b.sort),
  };
}

/**
 * 数据字典服务（sys_dict_type / sys_dict_item）
 * - 列表（含 items）/ 按 code 查 / 创建/更新/删除类型 + 项
 * - 字典项在同类型下 value 唯一（P2002 → DICT_VALUE_EXISTS）
 * - 核心操作写审计（DICT_CREATED / DICT_UPDATED / DICT_DELETED）
 */
@Injectable()
export class SysDictService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 全部字典类型（含 items，按 sort 升序） */
  async listTypes(): Promise<SysDictType[]> {
    const rows = await this.prisma.client.sysDictType.findMany({
      include: { items: true },
      orderBy: { sort: 'asc' },
    });
    return rows.map(toType);
  }

  /** 按 code 查字典类型（含 items） */
  async getTypeByCode(code: string): Promise<SysDictType | null> {
    const row = await this.prisma.client.sysDictType.findUnique({
      where: { code },
      include: { items: true },
    });
    return row ? toType(row) : null;
  }

  /** 创建字典类型 */
  async createType(input: unknown, operatorId: string): Promise<SysDictType> {
    const data = CreateDictTypeSchema.parse(input);
    try {
      const row = await this.prisma.client.sysDictType.create({
        data: {
          id: newId(),
          code: data.code,
          name: data.name,
          remark: data.remark ?? null,
          enabled: data.enabled ?? true,
          sort: data.sort ?? 0,
        },
        include: { items: true },
      });
      await this.audit.write({
        accountId: operatorId,
        action: AUDIT_ACTIONS.DICT_CREATED,
          resourceId: row.id,
        detail: { dictTypeId: row.id, code: row.code },
      });
      return toType(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BizException({ code: 'DICT_CODE_EXISTS', message: '字典编码已存在' });
      }
      throw error;
    }
  }

  /** 更新字典类型 */
  async updateType(id: string, input: unknown, operatorId: string): Promise<SysDictType> {
    const data = UpdateDictTypeSchema.parse(input);
    const existing = await this.prisma.client.sysDictType.findUnique({ where: { id } });
    if (!existing) {
      throw new BizException({ code: 'DICT_TYPE_NOT_FOUND', message: '字典类型不存在' });
    }
    const row = await this.prisma.client.sysDictType.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.remark !== undefined ? { remark: data.remark } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
      },
      include: { items: true },
    });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.DICT_UPDATED,
      resourceId: id,
      detail: { dictTypeId: id, code: row.code },
    });
    return toType(row);
  }

  /** 删除字典类型（级联删除其 items） */
  async removeType(id: string, operatorId: string): Promise<{ success: true }> {
    const existing = await this.prisma.client.sysDictType.findUnique({ where: { id } });
    if (!existing) {
      throw new BizException({ code: 'DICT_TYPE_NOT_FOUND', message: '字典类型不存在' });
    }
    await this.prisma.client.sysDictType.delete({ where: { id } });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.DICT_DELETED,
      resourceId: id,
      detail: { dictTypeId: id, code: existing.code },
    });
    return { success: true };
  }

  /** 创建字典项 */
  async createItem(input: unknown, operatorId: string): Promise<SysDictItem> {
    const data = CreateDictItemSchema.parse(input);
    const type = await this.prisma.client.sysDictType.findUnique({
      where: { id: data.dictTypeId },
    });
    if (!type) {
      throw new BizException({ code: 'DICT_TYPE_NOT_FOUND', message: '字典类型不存在' });
    }
    try {
      const row = await this.prisma.client.sysDictItem.create({
        data: {
          id: newId(),
          dictTypeId: data.dictTypeId,
          label: data.label,
          value: data.value,
          remark: data.remark ?? null,
          enabled: data.enabled ?? true,
          sort: data.sort ?? 0,
        },
      });
      await this.audit.write({
        accountId: operatorId,
        action: AUDIT_ACTIONS.DICT_CREATED,
        resourceType: 'sys_dict_item',
        resourceId: row.id,
        detail: { dictItemId: row.id, dictTypeId: row.dictTypeId, value: row.value },
      });
      return toItem(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BizException({ code: 'DICT_VALUE_EXISTS', message: '该字典项值已存在' });
      }
      throw error;
    }
  }

  /** 更新字典项 */
  async updateItem(id: string, input: unknown, operatorId: string): Promise<SysDictItem> {
    const data = UpdateDictItemSchema.parse(input);
    const existing = await this.prisma.client.sysDictItem.findUnique({ where: { id } });
    if (!existing) {
      throw new BizException({ code: 'DICT_ITEM_NOT_FOUND', message: '字典项不存在' });
    }
    const row = await this.prisma.client.sysDictItem.update({
      where: { id },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.remark !== undefined ? { remark: data.remark } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
      },
    });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.DICT_UPDATED,
      resourceType: 'sys_dict_item',
      resourceId: id,
      detail: { dictItemId: id, dictTypeId: row.dictTypeId, value: row.value },
    });
    return toItem(row);
  }

  /** 删除字典项 */
  async removeItem(id: string, operatorId: string): Promise<{ success: true }> {
    const existing = await this.prisma.client.sysDictItem.findUnique({ where: { id } });
    if (!existing) {
      throw new BizException({ code: 'DICT_ITEM_NOT_FOUND', message: '字典项不存在' });
    }
    await this.prisma.client.sysDictItem.delete({ where: { id } });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.DICT_DELETED,
      resourceType: 'sys_dict_item',
      resourceId: id,
      detail: { dictItemId: id, dictTypeId: existing.dictTypeId, value: existing.value },
    });
    return { success: true };
  }
}
