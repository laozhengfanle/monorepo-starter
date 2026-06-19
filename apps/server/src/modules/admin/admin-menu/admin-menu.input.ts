/**
 * 管理端菜单 GraphQL InputType
 *
 * 字段定义与 packages/shared/schemas/admin/admin-menu.schema.ts 保持一致
 */
import { Field, ID, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CreateAdminMenuInput {
    @Field(() => ID, { nullable: true, description: '父菜单 ID（根菜单不传）' })
    parentId?: string;

    @Field()
    name!: string;

    /** 菜单类型：directory | menu | button */
    @Field()
    type!: string;

    @Field(() => String, { nullable: true })
    path?: string;

    @Field(() => String, { nullable: true })
    routeName?: string;

    @Field(() => String, { nullable: true, description: '前端组件名称' })
    component?: string;

    @Field(() => String, { nullable: true })
    icon?: string;

    @Field(() => String, { nullable: true })
    permissionCode?: string;

    @Field(() => Int, { nullable: true })
    sort?: number;

    @Field(() => Boolean, { nullable: true })
    visible?: boolean;

    @Field(() => Boolean, { nullable: true })
    keepAlive?: boolean;

    @Field(() => Boolean, { nullable: true })
    enabled?: boolean;
}

@InputType()
export class UpdateAdminMenuInput {
    @Field(() => ID, { nullable: true })
    parentId?: string;

    @Field(() => String, { nullable: true })
    name?: string;

    @Field(() => String, { nullable: true })
    type?: string;

    @Field(() => String, { nullable: true })
    path?: string;

    @Field(() => String, { nullable: true })
    routeName?: string;

    @Field(() => String, { nullable: true })
    component?: string;

    @Field(() => String, { nullable: true })
    icon?: string;

    @Field(() => String, { nullable: true })
    permissionCode?: string;

    @Field(() => Int, { nullable: true })
    sort?: number;

    @Field(() => Boolean, { nullable: true })
    visible?: boolean;

    @Field(() => Boolean, { nullable: true })
    keepAlive?: boolean;

    @Field(() => Boolean, { nullable: true })
    enabled?: boolean;
}
