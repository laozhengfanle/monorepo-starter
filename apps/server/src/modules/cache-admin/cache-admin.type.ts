import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { CacheKey, CacheStats, DeleteCacheKeysResult } from '@starter/contracts';

/** 缓存 key 项 */
@ObjectType('CacheKey')
export class CacheKeyType implements CacheKey {
  @Field(() => String)
  key!: string;

  @Field(() => String)
  type!: string;

  @Field(() => Int)
  ttl!: number;

  @Field(() => String, { nullable: true })
  value!: string | null;

  @Field(() => Int)
  size!: number;
}

/** 缓存统计 */
@ObjectType('CacheStats')
export class CacheStatsType implements CacheStats {
  @Field(() => String)
  usedMemory!: string;

  @Field(() => String)
  hitRate!: string;

  @Field(() => String)
  uptime!: string;
}

/** 批量删除结果 */
@ObjectType('DeleteCacheKeysResult')
export class DeleteCacheKeysResultType implements DeleteCacheKeysResult {
  @Field(() => Int)
  deletedCount!: number;

  @Field(() => [String])
  keys!: string[];
}
