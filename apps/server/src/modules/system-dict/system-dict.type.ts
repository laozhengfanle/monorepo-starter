import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import type {
  CreateDictItemInput,
  CreateDictTypeInput,
  SysDictItem,
  SysDictType,
  UpdateDictItemInput,
  UpdateDictTypeInput,
} from '@starter/contracts';

/** 字典项 */
@ObjectType('SysDictItem')
export class SysDictItemType implements SysDictItem {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String)
  value!: string;

  @Field(() => String, { nullable: true })
  remark!: string | null;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => Int)
  sort!: number;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String)
  updatedAt!: string;
}

/** 字典类型（含 items） */
@ObjectType('SysDictType')
export class SysDictTypeType implements SysDictType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  code!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  remark!: string | null;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => Int)
  sort!: number;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String)
  updatedAt!: string;

  @Field(() => [SysDictItemType])
  items!: SysDictItemType[];
}

/** 创建字典类型入参 */
@InputType('CreateDictTypeInput')
export class CreateDictTypeInputType implements CreateDictTypeInput {
  @Field(() => String)
  code!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  remark?: string;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => Int, { nullable: true })
  sort?: number;
}

/** 更新字典类型入参 */
@InputType('UpdateDictTypeInput')
export class UpdateDictTypeInputType implements UpdateDictTypeInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  remark?: string;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => Int, { nullable: true })
  sort?: number;
}

/** 创建字典项入参 */
@InputType('CreateDictItemInput')
export class CreateDictItemInputType implements CreateDictItemInput {
  @Field(() => ID)
  dictTypeId!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String)
  value!: string;

  @Field(() => String, { nullable: true })
  remark?: string;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => Int, { nullable: true })
  sort?: number;
}

/** 更新字典项入参 */
@InputType('UpdateDictItemInput')
export class UpdateDictItemInputType implements UpdateDictItemInput {
  @Field(() => String, { nullable: true })
  label?: string;

  @Field(() => String, { nullable: true })
  remark?: string;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => Int, { nullable: true })
  sort?: number;
}
