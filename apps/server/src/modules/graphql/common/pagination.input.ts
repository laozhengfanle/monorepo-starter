/**
 * 分页输入 — 管理后台表格分页用
 *
 * 设计要点：
 * - page/pageSize 与 Zod PaginationSchema 字段名保持一致
 * - 配合 ZodArgsPipe 使用，在 resolver 中通过 @Args() 传入
 *   Service 层从 input.page / input.pageSize 读取
 *
 * 示例：
 * ```typescript
 * @Query(() => PaginatedAdminAccount)
 * async adminAccounts(
 *   @Args('input', { type: () => QueryAdminAccountInput }, new ZodArgsPipe(QueryAdminAccountSchema))
 *   input: QueryAdminAccountInput
 * ) {
 *   // input.page, input.pageSize 已由 Zod 验证
 * }
 * ```
 */
import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class PaginationInput {
    /** 当前页码，最小 1，默认 1 */
    @Field(() => Int, { defaultValue: 1 })
    page!: number;

    /** 每页条数，最小 1，最大 100，默认 20 */
    @Field(() => Int, { defaultValue: 20 })
    pageSize!: number;
}
