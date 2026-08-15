import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BatchUpdateConfigsDto, UpdateConfigDto } from '@starter/server-core';
import type { SystemConfig } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SystemConfigService } from './system-config.service.js';

/** 系统配置 REST 端点（权限 config:admin:*） */
@ApiTags('admin-configs')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/configs')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get()
  @RequirePermission('config:admin:view')
  @ApiOkResponse({ description: '全部配置项（含敏感字段，仅管理端）' })
  list(): Promise<SystemConfig[]> {
    return this.systemConfigService.list();
  }

  @Put(':key')
  @RequirePermission('config:admin:update')
  @ApiOkResponse({ description: '更新配置（UPSERT）' })
  @ApiBody({ type: UpdateConfigDto })
  update(
    @Param('key') key: string,
    @Body() body: UpdateConfigDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SystemConfig> {
    return this.systemConfigService.update(key, body, user.accountId);
  }

  @Post('batch')
  @RequirePermission('config:admin:update')
  @ApiOkResponse({ description: '批量更新配置' })
  @ApiBody({ type: BatchUpdateConfigsDto })
  batchUpdate(
    @Body() body: BatchUpdateConfigsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SystemConfig[]> {
    return this.systemConfigService.batchUpdate(body, user.accountId);
  }

  @Delete(':key')
  @RequirePermission('config:admin:delete')
  @ApiOkResponse({ description: '删除配置（软删除）' })
  remove(@Param('key') key: string, @CurrentUser() user: AuthUser): Promise<{ success: true }> {
    return this.systemConfigService.remove(key, user.accountId);
  }
}
