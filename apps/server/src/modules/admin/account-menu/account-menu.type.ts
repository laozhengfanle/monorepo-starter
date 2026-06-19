/**
 * 账户菜单特例授权 GraphQL 类型
 */
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('AccountMenuRow', { description: '账户菜单特例授权记录' })
export class AccountMenuRow {
    @Field(() => ID)
    id!: string;

    @Field(() => ID, { description: '账户 ID' })
    accountId!: string;

    @Field(() => ID, { description: '菜单 ID' })
    menuId!: string;

    @Field({ description: '菜单名称' })
    menuName!: string;

    @Field({ description: '授权类型：grant 授权 / deny 禁止' })
    type!: string;
}

@ObjectType('AccountMenuOverrideResult', { description: '批量保存结果' })
export class AccountMenuOverrideResult {
    @Field({ description: '操作是否成功' })
    success!: boolean;
}
