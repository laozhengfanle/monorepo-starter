import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { BatchUpdateConfigsSchema } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SystemConfigService } from './system-config.service.js';
import { BatchUpdateConfigsInputType, SystemConfigType } from './system-config.type.js';

/** 系统配置 GraphQL Resolver（权限 config:admin:*） */
@Resolver(() => SystemConfigType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SystemConfigResolver {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  /** 管理端全部配置 */
  @Query(() => [SystemConfigType])
  @RequirePermission('config:admin:view')
  async adminConfigs(): Promise<SystemConfigType[]> {
    return this.systemConfigService.list();
  }

  /** 批量更新配置 */
  @Mutation(() => [SystemConfigType])
  @RequirePermission('config:admin:update')
  async batchUpdateConfigs(
    @Args('input', { type: () => BatchUpdateConfigsInputType }, new ZodArgsPipe(BatchUpdateConfigsSchema))
    input: BatchUpdateConfigsInputType,
    @CurrentUser() user: AuthUser,
  ): Promise<SystemConfigType[]> {
    return this.systemConfigService.batchUpdate(input, user.accountId);
  }
}
