import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { AdminMenuNode, CreateMenuInput, MenuType, UpdateMenuInput } from '@starter/contracts';

/** 菜单节点（GraphQL 薄壳，递归 children） */
@ObjectType('AdminMenuNode')
export class AdminMenuNodeType implements AdminMenuNode {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, { nullable: true })
  parentId!: string | null;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  code!: string;

  @Field(() => String)
  type!: MenuType;

  @Field(() => String, { nullable: true })
  path!: string | null;

  @Field(() => String, { nullable: true })
  icon!: string | null;

  @Field(() => Int)
  sort!: number;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => Boolean)
  visible!: boolean;

  @Field(() => String)
  createdAt!: string;

  @Field(() => [AdminMenuNodeType])
  children!: AdminMenuNodeType[];
}

/** 创建菜单入参（GraphQL 薄壳） */
@InputType('CreateMenuInput')
export class CreateMenuInputType implements CreateMenuInput {
  @Field(() => ID, { nullable: true })
  parentId?: string | null;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  code!: string;

  @Field(() => String)
  type!: MenuType;

  @Field(() => String, { nullable: true })
  path?: string;

  @Field(() => String, { nullable: true })
  icon?: string;

  @Field(() => Int, { nullable: true })
  sort?: number;

  @Field(() => Boolean, { nullable: true })
  visible?: boolean;
}

/** 更新菜单入参（GraphQL 薄壳，全字段可选） */
@InputType('UpdateMenuInput')
export class UpdateMenuInputType implements UpdateMenuInput {
  @Field(() => ID, { nullable: true })
  parentId?: string | null;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  type?: MenuType;

  @Field(() => String, { nullable: true })
  path?: string;

  @Field(() => String, { nullable: true })
  icon?: string;

  @Field(() => Int, { nullable: true })
  sort?: number;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => Boolean, { nullable: true })
  visible?: boolean;
}
