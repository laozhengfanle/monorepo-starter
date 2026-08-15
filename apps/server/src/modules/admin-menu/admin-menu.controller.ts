import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreateMenuDto, UpdateMenuDto } from '@starter/server-core';
import type { AdminMenuNode } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { AdminMenuService } from './admin-menu.service.js';

/** 菜单管理 REST 端点（权限 menu:*） */
@ApiTags('admin-menus')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/menus')
export class AdminMenuController {
  constructor(private readonly adminMenuService: AdminMenuService) {}

  @Get()
  @RequirePermission('menu:list')
  @ApiOkResponse({ description: '完整菜单树' })
  listTree(): Promise<AdminMenuNode[]> {
    return this.adminMenuService.listTree();
  }

  @Post()
  @RequirePermission('menu:create')
  @ApiCreatedResponse({ description: '创建菜单/权限点' })
  @ApiBody({ type: CreateMenuDto })
  create(@Body() body: CreateMenuDto): Promise<AdminMenuNode> {
    return this.adminMenuService.create(body);
  }

  @Put(':id')
  @RequirePermission('menu:update')
  @ApiOkResponse({ description: '更新菜单/权限点' })
  @ApiBody({ type: UpdateMenuDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateMenuDto,
  ): Promise<AdminMenuNode> {
    return this.adminMenuService.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('menu:delete')
  @ApiOkResponse({ description: '删除菜单/权限点（无子节点时）' })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminMenuNode> {
    return this.adminMenuService.remove(id);
  }
}
