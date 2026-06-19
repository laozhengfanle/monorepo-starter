/**
 * 管理端角色 GraphQL ObjectType
 *
 * 字段设计：
 * - id: 角色 ID
 * - name: 角色名称（人类可读）
 * - code: 角色编码（机器可读，全局唯一）
 * - description: 角色描述
 * - enabled: 是否启用
 * - menuCount: 关联菜单数量（用于列表展示）
 * - userCount: 关联用户数（用于列表展示）
 * - menuIds: 关联菜单 ID 列表（仅详情接口返回，用于角色编辑）
 * - createdAt/updatedAt: 时间戳
 */
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AdminRole', { description: '管理端角色' })
export class AdminRole {
    @Field(() => ID)
    id!: string;

    @Field({ description: '角色名称（人类可读）' })
    name!: string;

    @Field({ description: '角色编码（机器可读，全局唯一）' })
    code!: string;

    @Field(() => String, { nullable: true, description: '角色描述' })
    description?: string;

    @Field({ description: '是否启用' })
    enabled!: boolean;

    /** 关联菜单数量（用于列表展示） */
    @Field(() => Int, { description: '关联菜单数量' })
    menuCount!: number;

    /** 关联用户数（用于列表展示） */
    @Field(() => Int, { description: '关联用户数' })
    userCount!: number;

    @Field(() => [ID], {
        nullable: true,
        description: '关联菜单 ID 列表（仅详情接口返回）',
    })
    menuIds?: string[];

    @Field({ description: '创建时间' })
    createdAt!: Date;

    @Field({ description: '更新时间' })
    updatedAt!: Date;
}
