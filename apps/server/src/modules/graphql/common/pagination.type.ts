/**
 * 通用分页输出（offset-based）
 *
 * 用法：
 * ```typescript
 * // 1. 定义领域类型
 * @ObjectType()
 * export class AdminAccount { ... }
 *
 * // 2. 用 Paginated() 工厂方法包装
 * export const PaginatedAdminAccount = Paginated(AdminAccount, 'PaginatedAdminAccount');
 *
 * // 3. resolver 中返回
 * @Query(() => PaginatedAdminAccount)
 * async adminAccounts(...) {
 *   return this.service.findAll(input);
 * }
 * ```
 *
 * 前端查询示例：
 * ```graphql
 * query AdminAccounts($input: QueryAdminAccountInput) {
 *   adminAccounts(input: $input) {
 *     items { id username nickname }
 *     total
 *     page
 *     pageSize
 *   }
 * }
 * ```
 */
import { Type } from '@nestjs/common';
import { Field, Int, ObjectType } from '@nestjs/graphql';

/** 通用分页结果接口 — 业务 Service 层返回的数据结构 */
export interface PaginatedType<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}

/**
 * 分页结果 ObjectType 工厂
 * - 泛型 T：领域类型（如 AdminAccount、AdminRole）
 * - name：在 GraphQL schema 中暴露的类型名（必须显式传入避免用默认名）
 * - 返回的 class 不会在全局注册 — 通过 @Query(() => PaginatedXxx) 显式声明
 */
export function Paginated<T>(classRef: Type<T>, name: string): Type<PaginatedType<T>> {
    @ObjectType(name)
    class ConcretePaginated implements PaginatedType<T> {
        @Field(() => [classRef])
        items!: T[];

        @Field(() => Int)
        total!: number;

        @Field(() => Int)
        page!: number;

        @Field(() => Int)
        pageSize!: number;
    }
    return ConcretePaginated;
}
