import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import type { UserVo } from '@starter/contracts';

/**
 * GraphQL 枚举 —— 值必须与 @starter/contracts 的 zod schema 保持一致。
 * （contracts 保持纯 zod、不依赖 GraphQL；此处用 registerEnumType 注册，
 * 成员名与值相同（小写），保证 GraphQL 序列化输出与 zod/REST 完全一致。）
 */
export enum UserRole {
  admin = 'admin',
  member = 'member',
}

export enum UserStatus {
  active = 'active',
  disabled = 'disabled',
  locked = 'locked',
}

registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(UserStatus, { name: 'UserStatus' });

/**
 * 用户视图对象（GraphQL 薄壳）。
 *
 * 契约层核心（方案 1）：`implements UserVo` 强制本类的字段形状与 zod 推断
 * 完全一致 —— zod 加字段/改类型而这里没跟上，就会编译失败。
 */
@ObjectType('User')
export class UserType implements UserVo {
  @Field(() => ID)
  id!: UserVo['id'];

  @Field(() => String)
  username!: UserVo['username'];

  @Field(() => String)
  email!: UserVo['email'];

  @Field(() => UserRole)
  role!: UserVo['role'];

  @Field(() => UserStatus)
  status!: UserVo['status'];

  @Field(() => String)
  createdAt!: UserVo['createdAt'];
}

/** 用户分页结果（items + total） */
@ObjectType('PaginatedUsers')
export class PaginatedUsersType {
  @Field(() => [UserType])
  items!: UserType[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  pageSize!: number;
}
