/**
 * 系统配置 GraphQL InputType
 *
 * 说明：DB schema 没有 type/description/group 字段，所以 input 中已移除这些字段。
 *      value 在 DB 中是 Json 类型，GraphQL 这边为兼容旧前端仍以 string 表达（写入时强制转换）。
 */
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateSystemConfigInput {
    @Field()
    key!: string;

    @Field()
    value!: string;
}

@InputType()
export class UpdateSystemConfigInput {
    @Field()
    value!: string;
}

/**
 * 单条配置更新输入（用于 updateConfig / batchUpdateConfigs）
 *
 * 与 UpdateSystemConfigInput 区别：
 * - value 是 JSON 对象（GraphQLJSONObject），不是字符串
 * - 不需要客户端提前 JSON.stringify
 * - 适配前端 e5b1fd8 重构后的新接口
 */
@InputType({ description: '单条配置更新输入' })
export class ConfigUpdateItemInput {
    @Field(() => String, { description: '配置 key' })
    key!: string;

    @Field(() => Object, { description: '配置值（JSON 对象）' })
    value!: Record<string, unknown>;
}

/**
 * 批量配置更新输入（用于 batchUpdateConfigs）
 */
@InputType({ description: '批量配置更新输入' })
export class BatchUpdateConfigsInputType {
    @Field(() => [ConfigUpdateItemInput], { description: '更新项列表（至少 1 条）' })
    updates!: ConfigUpdateItemInput[];
}

/**
 * 单条配置更新 mutation 的 input 参数
 *
 * 说明：把 key + value 装进一个 input 类，以解决 GraphQL JSON scalar 不能直接作为顶层 @Args 的问题
 * （NestJS 在顶层 @Args 解析时不识别 scalar 实例作为 type，需要装饰过的 class）
 */
@InputType({ description: 'updateConfig 的入参' })
export class UpdateConfigInputType {
    @Field(() => String, { description: '配置 key' })
    key!: string;

    @Field(() => Object, { description: '配置值（JSON 对象）' })
    value!: Record<string, unknown>;
}
