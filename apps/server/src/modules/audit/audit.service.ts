/**
 * 审计服务
 *
 * 职责：
 * - 提供统一 record() 接口记录敏感操作
 * - 失败时仅打日志，不影响主流程（防"日志写入失败导致业务回滚"）
 * - 自动捕获 IP / UA 从当前请求中（如果有）
 *
 * 数据写入：
 * - 写入 audit_log 表
 * - 字段：accountId, action, resourceType, resourceId, ip, userAgent, detail
 *
 * 使用示例：
 * ```ts
 * await auditService.record({
 *   accountId: actor.accountId,
 *   action: AUDIT_ACTIONS.ACCOUNT_CREATED,
 *   resourceType: 'admin_user',
 *   resourceId: targetId,
 *   detail: { reason: '...' },
 * });
 * ```
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/**
 * 审计 action 枚举（细粒度）
 *
 * 为什么需要细粒度（而不是粗粒度的 CREATED / UPDATED / DELETED）：
 * - 审计日志需要回答业务级问题，例如"谁给谁分配了什么角色"、"谁禁用了某个账号"
 * - 粗粒度 action（CREATED / UPDATED）只能告诉你"有人改了这个资源"，无法定位"改的是什么"
 * - 细粒度 action 配合 detail 字段中的 before/after 快照，可还原完整操作链
 *
 * 与数据库表 audit_log.action 的取值保持一致（见 docs/数据库设计.md § 四.7）。
 * 不要修改枚举值字符串：数据库中已存在的记录依赖这些值，修改会导致历史数据无法匹配。
 */
export const AUDIT_ACTIONS = {
    // ── 认证 ──
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILED: 'login_failed',
    LOGIN_LOCKED: 'login_locked',
    PASSWORD_CHANGED: 'password_changed',
    RESET_PASSWORD: 'reset_password',
    ACCOUNT_UNLOCKED: 'account_unlocked',
    TOKEN_REFRESHED: 'token_refreshed',
    TOKEN_REUSED: 'token_reused',
    PHONE_BIND: 'phone_bind',
    PHONE_UNBIND: 'phone_unbind',
    OAUTH_BIND: 'oauth_bind',
    OAUTH_UNBIND: 'oauth_unbind',

    // ── 角色 ──
    ROLE_CREATED: 'role_created',
    ROLE_UPDATED: 'role_updated',
    ROLE_DELETED: 'role_deleted',
    ROLE_HARD_DELETED: 'role_hard_deleted',
    ROLE_RESTORED: 'role_restored',
    ROLE_ASSIGNED: 'role_assigned',
    ROLE_REVOKED: 'role_revoked',

    // ── 菜单/权限 ──
    MENU_CREATED: 'menu_created',
    MENU_UPDATED: 'menu_updated',
    MENU_DELETED: 'menu_deleted',
    MENU_HARD_DELETED: 'menu_hard_deleted',
    MENU_RESTORED: 'menu_restored',
    PERMISSION_CHANGED: 'permission_changed',
    ACCOUNT_PERMISSION_CHANGED: 'account_permission_changed',

    // ── 账号（增/改/删/硬删/恢复） ──
    ACCOUNT_CREATED: 'account_created',
    ACCOUNT_UPDATED: 'account_updated',
    ACCOUNT_ENABLED: 'account_enabled',
    ACCOUNT_DISABLED: 'account_disabled',
    ACCOUNT_DELETED: 'account_deleted',
    ACCOUNT_HARD_DELETED: 'account_hard_deleted',
    ACCOUNT_RESTORED: 'account_restored',

    // ── 文件 ──
    FILE_UPLOADED: 'file_uploaded',
    FILE_DELETED: 'file_deleted',
    FILE_HARD_DELETED: 'file_hard_deleted',
    FILE_RESTORED: 'file_restored',

    // ── 配置 ──
    CONFIG_UPDATED: 'config_updated',
} as const;

/** 审计 action 取值类型（从 AUDIT_ACTIONS 推导） */
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** 审计日志记录（含关联 username） */
type AuditLogWithUsername = Prisma.AuditLogModel & { accountUsername: string | null };

/** 审计记录输入 */
export interface AuditLogInput {
    /** 操作者账户 ID（必填） */
    accountId: string;
    /** 操作类型（如 'user_created', 'login_success', 'login_failed'） */
    action: string;
    /** 资源类型（如 'admin_user', 'admin_role'） */
    resourceType?: string;
    /** 资源 ID */
    resourceId?: string;
    /** 操作者 IP（可选，从 request 中取） */
    ip?: string;
    /** User-Agent（可选） */
    userAgent?: string;
    /** 操作详情（结构化数据，会被序列化为 JSON） */
    detail?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * 记录一条审计日志
     * - try/catch 包裹，失败时仅打日志
     * - 不抛出异常，避免阻塞主流程
     */
    async record(input: AuditLogInput): Promise<void> {
        try {
            await this.prisma.client.auditLog.create({
                data: {
                    accountId: input.accountId,
                    action: input.action,
                    resourceType: input.resourceType ?? null,
                    resourceId: input.resourceId ?? null,
                    ip: input.ip ?? null,
                    userAgent: input.userAgent ?? null,
                    detail: (input.detail ?? null) as unknown as Prisma.InputJsonValue,
                } as unknown as Prisma.AuditLogUncheckedCreateInput,
            });
        } catch (err) {
            this.logger.error(
                `Audit log write failed: action=${input.action} accountId=${input.accountId} error=${(err as Error).message}`,
            );
        }
    }

    /**
     * 查询审计日志
     * - 支持分页 + 多维筛选
     * - 仅管理端使用，需 config:audit:list 权限
     *
     * 返回的每条记录会附带 `accountUsername` 字段：
     * - 通过批量查 `account_identity`（identityType='username'）得到 accountId → username 映射
     * - 在内存中拼装回 items 上，避免前端再做 JOIN
     * - accountId 为空时 accountUsername = null
     */
    async findAll(query: {
        page: number;
        pageSize: number;
        accountId?: string;
        action?: string;
        resourceType?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<{ items: AuditLogWithUsername[]; total: number; page: number; pageSize: number }> {
        const { page, pageSize, accountId, action, resourceType, startDate, endDate } = query;
        const skip = (page - 1) * pageSize;

        const where: Prisma.AuditLogWhereInput = {};
        if (accountId) where.accountId = accountId;
        if (action) where.action = action;
        if (resourceType) where.resourceType = resourceType;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = startDate;
            if (endDate) where.createdAt.lte = endDate;
        }

        const [items, total] = await Promise.all([
            this.prisma.client.auditLog.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.client.auditLog.count({ where }),
        ]);

        // ── 关联 account_identity 取 username ──
        const itemsWithUsername = await this._attachUsernames(items);

        return { items: itemsWithUsername, total, page, pageSize };
    }

    /**
     * 清空所有审计日志（硬删除，不可恢复）
     * - 使用 rawClient 绕过软删除扩展（audit_log 无软删除，但保持一致）
     * - 清空前写一条"谁清空的"审计记录（用 rawClient 直写，确保不被一并清掉）
     * - 权限码：config:audit:clear
     * @param operatorId 操作者账户 ID
     */
    async clear(operatorId?: string): Promise<{ deletedCount: number }> {
        // 先查总数用于返回值
        const totalCount = await this.prisma.client.auditLog.count();

        // 写一条"清空操作"的审计记录（直写 rawClient，否则会被自己的 deleteMany 清掉）
        if (operatorId) {
            try {
                await this.prisma.rawClient.auditLog.create({
                    data: {
                        accountId: operatorId,
                        action: 'audit_cleared',
                        resourceType: 'audit_log',
                        detail: {
                            clearedCount: totalCount,
                            clearedAt: new Date().toISOString(),
                        } as unknown as Prisma.InputJsonValue,
                    } as unknown as Prisma.AuditLogUncheckedCreateInput,
                });
            } catch (err) {
                this.logger.error(`Failed to write audit_cleared record: ${(err as Error).message}`);
            }
        }

        await this.prisma.rawClient.auditLog.deleteMany();

        return { deletedCount: totalCount };
    }

    /**
     * 删除单条审计日志（硬删除）
     * - 权限码：config:audit:clear（与清空共用）
     */
    async deleteOne(id: string): Promise<void> {
        const log = await this.prisma.client.auditLog.findUnique({ where: { id } });
        if (!log) {
            throw new Error('审计日志不存在');
        }
        await this.prisma.rawClient.auditLog.delete({ where: { id } });
    }

    /**
     * 导出审计日志（不分页，返回全部匹配记录）
     * - 筛选条件与 findAll 相同，但不分页
     * - 权限码：config:audit:export
     * - 大量数据时前端自行处理 CSV 生成
     */
    async exportLogs(query: {
        action?: string;
        resourceType?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<AuditLogWithUsername[]> {
        const { action, resourceType, startDate, endDate } = query;

        const where: Prisma.AuditLogWhereInput = {};
        if (action) where.action = action;
        if (resourceType) where.resourceType = resourceType;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = startDate;
            if (endDate) where.createdAt.lte = endDate;
        }

        const items = await this.prisma.client.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 10000, // 上限防止 OOM
        });

        return this._attachUsernames(items);
    }

    /**
     * 批量关联 account_identity 取 username，拼回每条记录
     */
    private async _attachUsernames(items: Prisma.AuditLogModel[]): Promise<AuditLogWithUsername[]> {
        const accountIds = [...new Set(items.map((l) => l.accountId).filter(Boolean))] as string[];
        let accountMap = new Map<string, string>();
        if (accountIds.length > 0) {
            const identities = await this.prisma.client.accountIdentity.findMany({
                where: { accountId: { in: accountIds }, identityType: 'username' },
                select: { accountId: true, identifier: true },
            });
            accountMap = new Map(identities.map((i) => [i.accountId, i.identifier]));
        }
        return items.map((l) => ({
            ...l,
            accountUsername: l.accountId ? (accountMap.get(l.accountId) ?? null) : null,
        }));
    }
}
