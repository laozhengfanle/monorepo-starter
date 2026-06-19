/**
 * 审计日志 GraphQL ObjectType
 */
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AuditLog', { description: '审计日志' })
export class AuditLog {
    @Field(() => ID)
    id!: string;

    @Field(() => String, { nullable: true, description: '操作者账户 ID' })
    accountId?: string;

    /**
     * 操作者用户名（关联 account_identity 表 identityType='username' 的 identifier 字段）
     *
     * 注意：项目里没有"admin_account.username"这样的表/列。
     * 用户名实际存在 `account_identity` 表里，identityType='username' 的那一行 identifier 列。
     * 这是 GraphQL 层的展示字段，由 AuditService.findAll 在查 audit_log 之后
     * 再批量查 account_identity 拼装得到，避免前端自己 JOIN。
     */
    @Field(() => String, {
        nullable: true,
        description: '操作者用户名（来自 account_identity 表 identityType=username 的 identifier）',
    })
    accountUsername?: string;

    @Field({ description: '操作类型' })
    action!: string;

    @Field(() => String, { nullable: true, description: '资源类型' })
    resourceType?: string;

    @Field(() => String, { nullable: true, description: '资源 ID' })
    resourceId?: string;

    @Field(() => String, { nullable: true, description: '操作详情（JSON 字符串）' })
    detail?: string;

    @Field(() => String, { nullable: true, description: '操作者 IP' })
    ip?: string;

    @Field(() => String, { nullable: true, description: 'User-Agent' })
    userAgent?: string;

    @Field({ description: '操作时间' })
    createdAt!: Date;
}

@ObjectType('ClearAuditLogsResult', { description: '清空审计日志结果' })
export class ClearAuditLogsResult {
    @Field(() => Int, { description: '被删除的记录数' })
    deletedCount!: number;
}
