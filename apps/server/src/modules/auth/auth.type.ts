import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { AdminMe, AuthResult, LoginInput } from '@starter/contracts';
import { AdminMenuNodeType } from '../admin-menu/admin-menu.type.js';

/** 登录入参（GraphQL 薄壳，implements 对齐 zod） */
@InputType('LoginInput')
export class LoginInputType implements LoginInput {
  @Field(() => String)
  username!: string;

  @Field(() => String)
  password!: string;
}

/** 登录结果（GraphQL 薄壳） */
@ObjectType('AuthResult')
export class AuthResultType implements AuthResult {
  @Field(() => String)
  accessToken!: string;

  @Field(() => String)
  refreshToken!: string;

  @Field(() => Int)
  expiresIn!: number;
}

/** 当前管理端用户信息（GraphQL 薄壳） */
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

  @Field(() => [String])
  roleCodes!: string[];

  @Field(() => [String])
  permissions!: string[];

  @Field(() => [AdminMenuNodeType])
  menus!: AdminMenuNodeType[];
}
