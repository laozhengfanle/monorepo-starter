import { Field, ID, InputType, ObjectType } from '@nestjs/graphql';
import type { BatchUpdateConfigsInput, ConfigUpdateItem, SystemConfig } from '@starter/contracts';

/** 系统配置项（管理端完整字段） */
@ObjectType('SystemConfig')
export class SystemConfigType implements SystemConfig {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  key!: string;

  /** 配置值（JSON 对象） */
  @Field(() => Object)
  value!: Record<string, unknown>;

  @Field(() => String, { nullable: true })
  remark!: string | null;

  @Field(() => String, { nullable: true })
  updatedBy!: string | null;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String)
  updatedAt!: string;
}

/** 单条配置更新输入 */
@InputType('ConfigUpdateItemInput')
export class ConfigUpdateItemInputType implements ConfigUpdateItem {
  @Field(() => String)
  key!: string;

  @Field(() => Object)
  value!: Record<string, unknown>;
}

/** 批量更新配置入参 */
@InputType('BatchUpdateConfigsInput')
export class BatchUpdateConfigsInputType implements BatchUpdateConfigsInput {
  @Field(() => [ConfigUpdateItemInputType])
  updates!: ConfigUpdateItemInputType[];
}
