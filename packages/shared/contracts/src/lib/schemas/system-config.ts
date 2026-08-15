import { z } from 'zod';

/**
 * 系统配置（system_config 表）契约
 * - key: 配置键（业务主键），如 settings / storage.driver / turnstile.config
 * - value: JSON 对象，由各业务页按需读取
 * - 前端只从 @starter/api-client 获取，不直接依赖本文件
 */

/** 系统配置项（管理端完整字段） */
export const SystemConfigSchema = z.object({
  id: z.string(),
  key: z.string(),
  /** 配置值（JSON 对象） */
  value: z.record(z.string(), z.unknown()),
  remark: z.string().nullable(),
  /** 最后更新人 accountId */
  updatedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SystemConfig = z.infer<typeof SystemConfigSchema>;

/** 单条配置更新输入（batchUpdateConfigs 用） */
export const ConfigUpdateItemSchema = z.object({
  key: z.string().min(1, '配置 key 不能为空').max(100, '配置 key 最多 100 个字符'),
  /** 配置值（JSON 对象） */
  value: z.record(z.string(), z.unknown()),
});

export type ConfigUpdateItem = z.input<typeof ConfigUpdateItemSchema>;

/** 批量更新配置入参（至少 1 条） */
export const BatchUpdateConfigsSchema = z.object({
  updates: z.array(ConfigUpdateItemSchema).min(1, '至少提交一条配置'),
});

export type BatchUpdateConfigsInput = z.input<typeof BatchUpdateConfigsSchema>;

/** 更新单个配置入参（REST PUT /admin/configs/:key） */
export const UpdateConfigSchema = z.object({
  value: z.record(z.string(), z.unknown()),
});

export type UpdateConfigInput = z.input<typeof UpdateConfigSchema>;

/** 配置 key 正则（小写字母开头，字母/数字/点/下划线） */
export const CONFIG_KEY_PATTERN = /^[a-z][a-z0-9._-]*$/;
