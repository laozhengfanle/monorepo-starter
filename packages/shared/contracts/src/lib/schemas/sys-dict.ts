import { z } from 'zod';

/**
 * 数据字典（sys_dict_type / sys_dict_item）契约
 * - 字典类型：如 audit_action（审计操作）/ storage_driver（存储驱动）
 * - 字典项：某类型下的可选项（label 展示 / value 存储）
 * - 权限点：config:dict:view（列表）/ config:dict:update（增改删）
 */

/** 字典项 */
export const SysDictItemSchema = z.object({
  id: z.string(),
  /** 字典项标签（展示），如 登录成功 */
  label: z.string(),
  /** 字典项值（存储），如 login_success */
  value: z.string(),
  remark: z.string().nullable(),
  enabled: z.boolean(),
  sort: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SysDictItem = z.infer<typeof SysDictItemSchema>;

/** 字典类型（含 items） */
export const SysDictTypeSchema = z.object({
  id: z.string(),
  /** 字典类型编码（机器可读，唯一），如 audit_action */
  code: z.string(),
  /** 字典类型名称（展示），如 审计操作类型 */
  name: z.string(),
  remark: z.string().nullable(),
  enabled: z.boolean(),
  sort: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(SysDictItemSchema),
});

export type SysDictType = z.infer<typeof SysDictTypeSchema>;

/** 创建字典类型入参 */
export const CreateDictTypeSchema = z.object({
  code: z
    .string()
    .min(1, '字典编码不能为空')
    .max(100, '字典编码最多 100 个字符')
    .regex(/^[a-z][a-z0-9_]*$/, '小写字母开头，仅限小写字母/数字/下划线'),
  name: z.string().min(1, '字典名称不能为空').max(100, '字典名称最多 100 个字符'),
  remark: z.string().max(255, '备注最多 255 个字符').optional(),
  enabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
});

export type CreateDictTypeInput = z.input<typeof CreateDictTypeSchema>;

/** 更新字典类型入参（全字段可选） */
export const UpdateDictTypeSchema = z.object({
  name: z.string().min(1, '字典名称不能为空').max(100, '字典名称最多 100 个字符').optional(),
  remark: z.string().max(255, '备注最多 255 个字符').optional(),
  enabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
});

export type UpdateDictTypeInput = z.input<typeof UpdateDictTypeSchema>;

/** 创建字典项入参 */
export const CreateDictItemSchema = z.object({
  dictTypeId: z.string().min(1, '字典类型不能为空'),
  label: z.string().min(1, '字典项标签不能为空').max(100, '标签最多 100 个字符'),
  value: z
    .string()
    .min(1, '字典项值不能为空')
    .max(100, '字典项值最多 100 个字符')
    .regex(/^[a-z][a-z0-9:_-]*$/, '小写字母开头，仅限小写字母/数字/冒号/下划线/连字符'),
  remark: z.string().max(255, '备注最多 255 个字符').optional(),
  enabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
});

export type CreateDictItemInput = z.input<typeof CreateDictItemSchema>;

/** 更新字典项入参（全字段可选） */
export const UpdateDictItemSchema = z.object({
  label: z.string().min(1, '字典项标签不能为空').max(100, '标签最多 100 个字符').optional(),
  remark: z.string().max(255, '备注最多 255 个字符').optional(),
  enabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
});

export type UpdateDictItemInput = z.input<typeof UpdateDictItemSchema>;
