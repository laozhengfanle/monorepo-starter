import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import type {
  AdminAccount,
  CreateAdminAccountInput,
  UpdateAdminAccountInput,
} from '@starter/contracts';

/** 管理端账户（GraphQL 薄壳，implements 对齐 zod） */
@ObjectType('AdminAccount')
export class AdminAccountType implements AdminAccount {
  @Field(() => ID)
  accountId!: string;

  @Field(() => String)
  username!: string;

  @Field(() => String)
  nickname!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String)
  avatar!: string;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => [String])
  roleCodes!: string[];

  @Field(() => String)
  createdAt!: string;
}

/** 账户分页结果 */
@ObjectType('PaginatedAdminAccounts')
export class PaginatedAdminAccountsType {
  @Field(() => [AdminAccountType])
  items!: AdminAccountType[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  pageSize!: number;
}

/** 管理端角色（供账户管理分配角色） */
@ObjectType('AdminRole')
export class AdminRoleType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  code!: string;

  @Field(() => String)
  name!: string;
}

/** 创建管理员入参（GraphQL 薄壳） */
@InputType('CreateAdminAccountInput')
export class CreateAdminAccountInputType implements CreateAdminAccountInput {
  @Field(() => String)
  username!: string;

  @Field(() => String)
  password!: string;

  @Field(() => String, { nullable: true })
  nickname?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => [String])
  roleCodes!: string[];
}

/** 更新管理员入参（GraphQL 薄壳，全字段可选） */
@InputType('UpdateAdminAccountInput')
export class UpdateAdminAccountInputType implements UpdateAdminAccountInput {
  @Field(() => String, { nullable: true })
  nickname?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => [String], { nullable: true })
  roleCodes?: string[];
}
