import { Field, InputType } from '@nestjs/graphql';
import type { CreateUserInput } from '@starter/contracts';
import { UserRole, UserStatus } from './user.type.js';

/**
 * 创建用户入参（GraphQL 薄壳）。
 * `implements CreateUserInput` 强制与 zod schema 对齐（z.input：role/status 可选）。
 */
@InputType('CreateUserInput')
export class CreateUserInputType implements CreateUserInput {
  @Field(() => String)
  username!: CreateUserInput['username'];

  @Field(() => String)
  email!: CreateUserInput['email'];

  @Field(() => UserRole, { nullable: true })
  role?: CreateUserInput['role'];

  @Field(() => UserStatus, { nullable: true })
  status?: CreateUserInput['status'];
}
