/**
 * GraphQL JSON 自定义 Scalar
 *
 * 用途：在 GraphQL schema 中表达"任意 JSON 值"（对象 / 数组 / 标量都支持）。
 *
 * 实现：
 * - 用 @nestjs/graphql 的 @Scalar 装饰器把 'JSON' 这个 GraphQL 标量类型
 *   包装为可在 @Field / @Args 中引用的 class
 * - parseValue: 处理 variables 中的 JSON 值（已是 JS 对象，原样返回）
 * - serialize: 把 DB / service 返回的对象序列化为 GraphQL 响应（已是 JS 对象，原样返回）
 * - parseLiteral: 处理 query 内联的 JSON 字面量（解析 AST → 实际值）
 *
 * 为什么不直接用 graphql-type-json 的 GraphQLJSON：
 * - GraphQLJSON 是 GraphQLScalarType 实例，NestJS 的 @Field(() => TypeFn) 需要一个 class
 *   来获取 prototype 上的装饰器元数据
 * - 实例类型不能直接作为 @Field 的 type 引用，所以必须用 @Scalar 包装一层
 *
 * 安全说明：
 * - parseValue 接受任意 JS 值（前端传什么就拿什么），不做白名单过滤
 * - 安全边界在 Zod schema（service 层）+ Prisma 写入
 * - 攻击者如能控制 GraphQL variables，可传入任意 JSON，但 service 层会用 Zod 拒绝非对象
 */
import { Scalar, CustomScalar } from '@nestjs/graphql';
import { type ValueNode } from 'graphql';

@Scalar('JSON', () => Object)
export class JsonScalar implements CustomScalar<unknown, unknown> {
    /** schema 内省时显示的描述 */
    description = '任意 JSON 值（对象 / 数组 / 字符串 / 数字 / 布尔 / null）';

    /**
     * 处理 variables 中的 JSON 值
     * - 已是 JS 值（GraphQL 客户端已 JSON 序列化过一次），原样返回
     */
    parseValue(value: unknown): unknown {
        return value;
    }

    /**
     * 把 JS 值序列化为 GraphQL 响应
     * - 已是 JS 值，原样返回
     */
    serialize(value: unknown): unknown {
        return value;
    }

    /**
     * 处理 query 内联的 JSON 字面量
     * - 例如 { value: { foo: "bar" } } 中，{ foo: "bar" } 是 OBJECT kind
     * - 通过把 AST 节点 JSON 化再 parse 回 JS 值（简单可靠，覆盖所有 literal 形式）
     */
    parseLiteral(ast: ValueNode): unknown {
        return JSON.parse(JSON.stringify(ast));
    }
}
