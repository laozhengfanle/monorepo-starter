import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { BatchUpdateConfigsSchema, UpdateConfigSchema } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SystemConfigService } from './system-config.service.js';
import { BatchUpdateConfigsInputType, SystemConfigType, UpdateConfigInputType } from './system-config.type.js';

/** 系统配置 GraphQL Resolver（config:admin:* 通用 + config:file:* / config:turnstile:* 页面级） */
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

  /** 文件存储配置（storage.driver，config:file:view） */
  @Query(() => SystemConfigType, { nullable: true })
  @RequirePermission('config:file:view')
  async storageConfig(): Promise<SystemConfigType | null> {
    return this.systemConfigService.getByKey('storage.driver');
  }

  /** Turnstile 配置（turnstile.config，config:turnstile:view） */
  @Query(() => SystemConfigType, { nullable: true })
  @RequirePermission('config:turnstile:view')
  async turnstileConfig(): Promise<SystemConfigType | null> {
    return this.systemConfigService.getByKey('turnstile.config');
  }

  /** 更新单条配置（config:turnstile:update 等页面级写权限） */
  @Mutation(() => SystemConfigType)
  @RequirePermission('config:turnstile:update')
  async updateTurnstileConfig(
    @Args('input', { type: () => UpdateConfigInputType }, new ZodArgsPipe(UpdateConfigSchema))
    input: UpdateConfigInputType,
    @CurrentUser() user: AuthUser,
  ): Promise<SystemConfigType> {
    return this.systemConfigService.update('turnstile.config', input, user.accountId);
  }
}
