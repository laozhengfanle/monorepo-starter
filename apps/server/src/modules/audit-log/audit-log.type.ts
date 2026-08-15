import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import type { AuditLogItem, ClearAuditLogsResult } from '@starter/contracts';

/** 审计日志项 */
@ObjectType('AuditLogItem')
export class AuditLogItemType implements AuditLogItem {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  accountId!: string | null;

  /** 操作者用户名（服务端 join account_identity 拼装） */
  @Field(() => String, { nullable: true })
  accountUsername!: string | null;

  @Field(() => String)
  action!: string;

  @Field(() => String, { nullable: true })
  resourceType!: string | null;

  @Field(() => String, { nullable: true })
  resourceId!: string | null;

  /** 操作详情（JSON 字符串） */
  @Field(() => String, { nullable: true })
  detail!: string | null;

  @Field(() => String, { nullable: true })
  ip!: string | null;

  @Field(() => String, { nullable: true })
  userAgent!: string | null;

  @Field(() => String)
  createdAt!: string;
}

/** 审计日志分页结果 */
@ObjectType('PaginatedAuditLogs')
export class PaginatedAuditLogsType {
  @Field(() => [AuditLogItemType])
  items!: AuditLogItemType[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  pageSize!: number;
}

/** 清空审计日志结果 */
@ObjectType('ClearAuditLogsResult')
export class ClearAuditLogsResultType implements ClearAuditLogsResult {
  @Field(() => Int)
  deletedCount!: number;
}
