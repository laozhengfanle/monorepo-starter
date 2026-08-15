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
  /** 起始时间（ISO） */
  startDate: z.string().optional(),
  /** 结束时间（ISO） */
  endDate: z.string().optional(),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

/** 清空审计日志结果 */
export const ClearAuditLogsResultSchema = z.object({
  /** 被删除的记录数 */
  deletedCount: z.number().int().nonnegative(),
});

export type ClearAuditLogsResult = z.infer<typeof ClearAuditLogsResultSchema>;

/** 审计动作词表（与后端 AUDIT_ACTIONS 对齐，供前端筛选下拉） */
export const AUDIT_ACTION_OPTIONS = [
  'login_success',
  'login_failed',
  'login_locked',
  'logout',
  'password_changed',
  'reset_password',
  'token_refreshed',
  'token_reused',
  'account_created',
  'account_updated',
  'account_enabled',
  'account_disabled',
  'account_deleted',
  'account_restored',
  'account_hard_deleted',
  'role_created',
  'role_updated',
  'role_deleted',
  'role_assigned',
  'role_revoked',
  'menu_created',
  'menu_updated',
  'menu_deleted',
  'permission_changed',
  'account_permission_changed',
  'file_uploaded',
  'file_deleted',
  'config_updated',
  'audit_cleared',
] as const;

/** 资源类型下拉（前端筛选用） */
export const AUDIT_RESOURCE_TYPE_OPTIONS = [
  'admin_account',
  'admin_role',
  'admin_menu',
  'system_config',
  'upload_file',
  'account_identity',
  'auth',
  'audit_log',
] as const;
