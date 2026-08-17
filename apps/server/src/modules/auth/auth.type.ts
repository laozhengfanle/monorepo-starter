import { Field, ID, ObjectType } from '@nestjs/graphql';
import type { AdminMe } from '@starter/contracts';
import { AdminMenuNodeType } from '../admin-menu/admin-menu.type.js';

/**
 * 当前管理端用户信息（GraphQL 薄壳）。
 * 注：登录入参/结果类型已随 login mutation 一并移除（认证仅走 REST AuthController）。
 */
@ObjectType('AdminMe')
export class AdminMeType implements AdminMe {
  @Field(() => ID)
  accountId!: string;

  @Field(() => String)
  username!: string;

  @Field(() => String)
  nickname!: string;

  @Field(() => String)
  avatar!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String)
  phone!: string;

  @Field(() => String)
  createdAt!: string;

  @Field(() => [String])
  roleCodes!: string[];

  @Field(() => [String])
  permissions!: string[];

  @Field(() => [AdminMenuNodeType])
  menus!: AdminMenuNodeType[];
}
