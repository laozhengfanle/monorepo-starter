import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreateRoleDto, UpdateRoleDto } from '@starter/server-core';
import type { AdminRole } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { AdminRoleService } from './admin-role.service.js';

/** 角色管理 REST 端点（权限 role:*） */
@ApiTags('admin-roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/roles')
export class AdminRoleController {
  constructor(private readonly adminRoleService: AdminRoleService) {}

  @Get()
  @RequirePermission('role:list')
  @ApiOkResponse({ description: '角色列表（含权限点）' })
  list(): Promise<AdminRole[]> {
    return this.adminRoleService.list();
  }

  @Post()
  @RequirePermission('role:create')
  @ApiCreatedResponse({ description: '创建角色' })
  @ApiBody({ type: CreateRoleDto })
  create(@Body() body: CreateRoleDto): Promise<AdminRole> {
    return this.adminRoleService.create(body);
  }

  @Put(':id')
  @RequirePermission('role:update')
  @ApiOkResponse({ description: '更新角色' })
  @ApiBody({ type: UpdateRoleDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateRoleDto,
  ): Promise<AdminRole> {
    return this.adminRoleService.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('role:delete')
  @ApiOkResponse({ description: '删除角色' })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminRole> {
    return this.adminRoleService.remove(id);
  }
}
