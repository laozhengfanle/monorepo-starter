/**
 * 审计日志 API
 *
 * 接口拆分：
 *   - GraphQL Query：日志列表查询 / 导出
 *   - GraphQL Mutation：清空日志
 *
 * 后端路由对照：
 *   GraphQL query { adminLogs }        → 分页查询审计日志
 *   GraphQL query { exportAuditLogs }  → 导出审计日志（全量）
 *   GraphQL mutation { clearAuditLogs } → 清空审计日志
 */
import { gqlQuery } from '@/shared/request/graphql-client';
import type { PaginatedResult, PaginatedParams } from './helpers';

// ============================================================
// 类型
// ============================================================

/**
 * 审计日志表格行（前端 UI 使用的"审计风格"形状）
 *
 * 字段名按 UI 列名取，便于模板直接 v-for / key 引用。
 * 不要再翻译成 level/source/message 那种"应用日志"风格——会掩盖审计语义。
 */
export interface LogRow {
    /** 行主键 */
    id: string;
    /** 时间（后端 createdAt） */
    time: string;
    /** 操作者（后端 accountUsername；null 时 UI 兜底显示"系统"） */
    operator: string;
    /** 操作类型（后端 action，如 'login_success' / 'account_created'） */
    action: string;
    /** 资源类型（后端 resourceType） */
    resourceType: string;
    /** 资源 ID（后端 resourceId） */
    resourceId: string;
    /** 操作者 IP（后端 ip） */
    ip: string;
    /** 操作详情（后端 detail，JSON 字符串；前端可 JSON.parse 后渲染） */
    detail: string;
}

// ============================================================
// GraphQL API（查询操作）
// ============================================================

/**
 * 分页获取审计日志，走 GraphQL
 *
 * @param params 基础分页参数 + 筛选参数（action / resourceType / 时间区间）
 *               所有字段都可选；不传 = 不过滤
 */
export async function getLogs(
    params: PaginatedParams & {
        action?: string;
        resourceType?: string;
        startDate?: string;
        endDate?: string;
    },
): Promise<PaginatedResult<LogRow>> {
    const data = await gqlQuery<{
        adminLogs: { items: AuditLogRaw[]; total: number };
    }>(
        `
      query AdminLogs(
        $page: Int!
        $pageSize: Int!
        $action: String
        $resourceType: String
        $startDate: DateTime
        $endDate: DateTime
      ) {
        adminLogs(
          page: $page
          pageSize: $pageSize
          action: $action
          resourceType: $resourceType
          startDate: $startDate
          endDate: $endDate
        ) {
          items {
            id
            createdAt
            accountUsername
            action
            resourceType
            resourceId
            ip
            detail
          }
          total
        }
      }
    `,
        {
            // 只把有值的字段透传给后端（undefined 会让 GraphQL 变量变成 null，等同不传）
            variables: {
                page: params.page,
                pageSize: params.pageSize,
                action: params.action || undefined,
                resourceType: params.resourceType || undefined,
                startDate: params.startDate || undefined,
                endDate: params.endDate || undefined,
            },
        },
    );
    // 后端 AuditLog 字段是 createdAt/accountUsername/action/resourceType/resourceId/ip/detail
    // 前端表格统一映射成 7 列审计风格
    return {
        data: data.adminLogs.items.map(toLogRow),
        total: data.adminLogs.total,
    };
}

/**
 * 后端 AuditLog 原始形状（GraphQL 返回）
 *
 * accountUsername 是后端 AuditService.findAll 在 service 层批量关联
 * account_identity 表（identityType='username'）后拼装好的字段，
 * 前端无需再做 JOIN。
 */
interface AuditLogRaw {
    id: string;
    createdAt: string;
    accountUsername?: string | null;
    action: string;
    resourceType?: string | null;
    resourceId?: string | null;
    ip?: string | null;
    detail?: string | null;
}

/**
 * 把后端 AuditLog 映射成前端表格的 LogRow（审计风格）
 *
 * - operator 为 null/空 → 显示 "系统"（系统级审计 / 定时任务等没有操作者账户）
 * - 其他字段为空 → 显示 "-"（占位，避免表格空白）
 */
function toLogRow(raw: AuditLogRaw): LogRow {
    return {
        id: raw.id,
        time: raw.createdAt,
        operator: raw.accountUsername || '系统',
        action: raw.action || '-',
        resourceType: raw.resourceType || '-',
        resourceId: raw.resourceId || '-',
        ip: raw.ip || '-',
        detail: raw.detail || '-',
    };
}

// ============================================================
// GraphQL Mutation（写操作）
// ============================================================

/**
 * 删除单条审计日志（硬删除）
 * - 权限码：config:audit:clear
 */
export async function deleteLog(id: string): Promise<boolean> {
    const data = await gqlQuery<{ deleteAuditLog: boolean }>(
        `
      mutation DeleteAuditLog($id: ID!) {
        deleteAuditLog(id: $id)
      }
    `,
        { variables: { id } },
    );
    return data.deleteAuditLog;
}

/**
 * 清空所有审计日志（硬删除，不可恢复）
 * - 权限码：config:audit:clear
 * @returns 被删除的记录数
 */
export async function clearLogs(): Promise<number> {
    const data = await gqlQuery<{ clearAuditLogs: { deletedCount: number } }>(
        `
      mutation ClearAuditLogs {
        clearAuditLogs {
          deletedCount
        }
      }
    `,
    );
    return data.clearAuditLogs.deletedCount;
}

/**
 * 导出审计日志（全量，上限 10000 条）
 * - 权限码：config:audit:export
 * - 筛选条件与 getLogs 一致但不分页
 */
export async function exportLogs(params: {
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
}): Promise<LogRow[]> {
    const data = await gqlQuery<{ exportAuditLogs: AuditLogRaw[] }>(
        `
      query ExportAuditLogs(
        $action: String
        $resourceType: String
        $startDate: DateTime
        $endDate: DateTime
      ) {
        exportAuditLogs(
          action: $action
          resourceType: $resourceType
          startDate: $startDate
          endDate: $endDate
        ) {
          id
          createdAt
          accountUsername
          action
          resourceType
          resourceId
          ip
          detail
        }
      }
    `,
        {
            variables: {
                action: params.action || undefined,
                resourceType: params.resourceType || undefined,
                startDate: params.startDate || undefined,
                endDate: params.endDate || undefined,
            },
        },
    );
    return data.exportAuditLogs.map(toLogRow);
}
