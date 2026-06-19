/**
 * 通用游标分页输出（cursor-based）
 *
 * 用法与 Paginated 类似：
 * ```typescript
 * @ObjectType()
 * export class Course { ... }
 *
 * export const CursorPaginatedCourse = CursorPaginated(Course);
 *
 * @Query(() => CursorPaginatedCourse)
 * async courses(...) {
 *   return this.service.findCursor(input);
 * }
 * ```
 *
 * 前端查询示例：
 * ```graphql
 * query Courses($input: CursorInput) {
 *   courses(input: $input) {
 *     items { id title coverImage }
 *     nextCursor
 *     hasMore
 *   }
 * }
 * ```
 *
 * 实现要点（Service 层）：
 * - 多取一条（take + 1）来判断 hasMore
 * - hasMore=true 时弹出最后一条，nextCursor = items[items.length-1].id
 * - hasMore=false 时 nextCursor = null
 */
import { Type } from '@nestjs/common';
import { Field, ObjectType } from '@nestjs/graphql';

/** 游标分页结果接口 */
export interface CursorPaginatedType<T> {
    items: T[];
    nextCursor: string | null;
    hasMore: boolean;
}

/**
 * 游标分页 ObjectType 工厂
 * - 泛型 T：领域类型
 * - name：在 GraphQL schema 中暴露的类型名（必须显式传入避免用默认名）
 * - 返回 abstract class，不会在 schema 中直接注册
 */
export function CursorPaginated<T>(classRef: Type<T>, name: string): Type<CursorPaginatedType<T>> {
    @ObjectType(name, { isAbstract: true })
    abstract class CursorPaginatedTypeClass implements CursorPaginatedType<T> {
        /** 当前页数据列表 */
        @Field(() => [classRef])
        items!: T[];

        /**
         * 下一页的游标（取最后一条记录的 ID）
         * - null 表示已到最后一页
         * - 前端下次请求把这个值原样传给 cursor 参数
         */
        @Field(() => String, { nullable: true })
        nextCursor!: string | null;

        /** 是否还有更多数据 */
        @Field(() => Boolean)
        hasMore!: boolean;
    }
    return CursorPaginatedTypeClass as Type<CursorPaginatedType<T>>;
}
