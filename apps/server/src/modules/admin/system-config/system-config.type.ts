/**
 * 系统配置 GraphQL ObjectType
 *
 * 设计：
 * - key: 配置键（业务主键）
 * - value: 配置值（JSON 值，由前端按需 parse）
 * - updatedAt: 更新时间
 *
 * 说明：DB schema（prisma）实际只有 id/key/value/remark/updatedBy/createdAt/updatedAt，
 *      所以 type/description/group 字段已移除（避免 GraphQL 类型与 Prisma 字段不一致）。
 */
import { Field, ObjectType, GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType('SystemConfig', { description: '系统配置' })
export class SystemConfig {
    @Field()
    key!: string;

    /** 配置值（前端按需 parse：string / number / boolean / json） */
    @Field({ description: '配置值（前端按需 parse：string / number / boolean / json）' })
    value!: string;

    @Field({ description: '更新时间' })
    updatedAt!: Date;
}

/**
 * 管理端配置（新版 adminConfigs 接口使用）
 *
 * 与 SystemConfig 区别：
 * - 包含完整管理字段（id / remark / updatedBy / createdAt）
 * - value 是已解析的 JSON 对象（GraphQLJSONObject），不是字符串
 * - 适配前端 e5b1fd8 重构后的新接口（adminConfigs / updateConfig / batchUpdateConfigs）
 *
 * 旧 SystemConfig 保留向后兼容；新代码应使用 AdminConfig。
 */
@ObjectType('AdminConfig', { description: '管理端配置（完整字段 + JSON 值）' })
export class AdminConfig {
    @Field(() => String, { description: '配置 ID' })
    id!: string;

    @Field(() => String, { description: '配置 key（业务主键）' })
    key!: string;

    /**
     * 配置值（JSON 对象）
     * - DB 存储为 JSON；service 在 toAdminConfig 中解析为对象
     * - 前端按业务含义使用（如 settings: { name, logo, footerText }）
     */
    @Field(() => Object, { description: '配置值（JSON 对象）' })
    value!: Record<string, unknown>;

    @Field(() => String, { nullable: true, description: '备注' })
    remark!: string | null;

    @Field(() => String, { nullable: true, description: '最后更新人 accountId' })
    updatedBy!: string | null;

    @Field(() => GraphQLISODateTime, { description: '创建时间' })
    createdAt!: Date;

    @Field(() => GraphQLISODateTime, { description: '更新时间' })
    updatedAt!: Date;
}
