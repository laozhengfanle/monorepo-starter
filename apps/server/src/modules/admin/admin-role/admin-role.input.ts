/**
 * 管理端角色 GraphQL InputType
 *
 * 字段定义与 packages/shared/schemas/admin/admin-role.schema.ts 保持一致
 */
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class CreateAdminRoleInput {
    @Field()
    name!: string;

    @Field()
    code!: string;

    @Field(() => String, { nullable: true })
    description?: string;

    @Field(() => Boolean, { nullable: true })
    enabled?: boolean;
}

@InputType()
export class UpdateAdminRoleInput {
    @Field(() => String, { nullable: true })
    name?: string;

    @Field(() => String, { nullable: true })
    description?: string;

    @Field(() => Boolean, { nullable: true })
    enabled?: boolean;
}

@InputType()
export class AssignRoleMenusInput {
    @Field(() => ID)
    roleId!: string;

    @Field(() => [ID])
    menuIds!: string[];
}
