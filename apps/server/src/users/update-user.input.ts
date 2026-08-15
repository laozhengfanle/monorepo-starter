import { Field, InputType } from '@nestjs/graphql';
import type { UpdateUserInput } from '@starter/contracts';
import { UserRole, UserStatus } from './user.type.js';

/**
 * 更新用户入参（GraphQL 薄壳，全字段可选）。
 * `implements UpdateUserInput` 强制与 zod schema 对齐（z.input：全字段可选）。
 */
@InputType('UpdateUserInput')
export class UpdateUserInputType implements UpdateUserInput {
  @Field(() => String, { nullable: true })
  username?: UpdateUserInput['username'];

  @Field(() => String, { nullable: true })
  email?: UpdateUserInput['email'];

  @Field(() => UserRole, { nullable: true })
  role?: UpdateUserInput['role'];

  @Field(() => UserStatus, { nullable: true })
  status?: UpdateUserInput['status'];
}
