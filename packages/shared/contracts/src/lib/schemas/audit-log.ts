import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

/**
 * 审计日志（audit_log 表）契约
 * - 审计日志无软删除；accountUsername 由服务端批量 join account_identity 拼装
 * - 权限点：config:audit:view / export / clear / delete
 */

/** 审计日志项（管理端展示） */
export const AuditLogItemSchema = z.object({
  id: z.string(),
  /** 操作者账户 ID（可空 = 系统操作） */
  accountId: z.string().nullable(),
  /** 操作者用户名（服务端 join account_identity 拼装） */
  accountUsername: z.string().nullable(),
  /** 操作类型，如 login_success / account_created / config_updated */
  action: z.string(),
  /** 资源类型，如 admin_account / admin_role / system_config */
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  /** 操作详情（JSON 字符串，前端 pretty-print） */
  detail: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** 操作时间（ISO） */
  createdAt: z.string(),
});

export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;

/** 审计日志分页查询参数 */
export const AuditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  /** 起始时间（ISO 8601，须带时区，如 2024-01-01T00:00:00.000Z） */
  startDate: z.string().datetime({ offset: true }).optional(),
  /** 结束时间（ISO 8601，须带时区） */
  endDate: z.string().datetime({ offset: true }).optional(),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

/** 清空审计日志结果 */
export const ClearAuditLogsResultSchema = z.object({
  /** 被删除的记录数 */
  deletedCount: z.number().int().nonnegative(),
});

export type ClearAuditLogsResult = z.infer<typeof ClearAuditLogsResultSchema>;
