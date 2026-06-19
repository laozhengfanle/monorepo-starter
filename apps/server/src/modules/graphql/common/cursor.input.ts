/**
 * 游标分页输入 — C 端信息流 / 下拉加载用
 *
 * 为什么用游标分页而不是 offset：
 * - offset 分页在数据频繁变动时会重复或遗漏（如无限滚动时新数据插入）
 * - 游标基于稳定 ID 排序，避免上述问题
 *
 * 使用场景：
 * - 客户端首次请求不传 cursor
 * - 服务端返回 nextCursor 和 hasMore
 * - 客户端下次请求把 nextCursor 传回来
 * - hasMore=false 表示已到最后一页
 *
 * includeCursor 用途：
 * - 默认 skip cursor 自身（避免重复显示）
 * - 设为 true 时包含 cursor 对应的那条记录（用于"加载更多"场景的边界）
 */
import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CursorInput {
    /** 上一页最后一条记录的 ID，首次请求不传 */
    @Field(() => String, { nullable: true })
    cursor?: string;

    /** 本次请求要获取的数量，默认 20 */
    @Field(() => Int, { defaultValue: 20 })
    take!: number;

    /**
     * 是否包含 cursor 对应的那条记录
     * - false（默认）：跳过 cursor 自身
     * - true：包含 cursor 对应记录（适合"上拉刷新"显示最新一条）
     */
    @Field(() => Boolean, { nullable: true })
    includeCursor?: boolean;
}
