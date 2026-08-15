import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateUserDto,
  PaginatedUsersResponseDto,
  QueryUsersDto,
  UpdateUserDto,
  UserVo,
} from '@starter/server-core';
import type { PaginatedData } from '@starter/contracts';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard.js';
import { PermissionGuard } from '../modules/auth/permission.guard.js';
import { RequirePermission } from '../modules/auth/permission.decorator.js';
import { UsersService } from './users.service.js';

/**
 * 用户 REST 端点（阶段 3 扩展）：JWT 认证 + 权限点校验（RBAC 演示）
 * - JwtAuthGuard：未登录 401
 * - PermissionGuard + @RequirePermission：角色权限不足 403
 */
@ApiTags('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('user:list')
  @ApiOkResponse({ type: PaginatedUsersResponseDto })
  list(@Query() query: QueryUsersDto): Promise<PaginatedData<UserVo>> {
    return this.usersService.list(query);
  }

  @Get('deleted')
  @RequirePermission('user:list')
  @ApiOkResponse({ description: '已删除用户列表（软删除视图）' })
  listDeleted(@Query() query: QueryUsersDto): Promise<PaginatedData<UserVo>> {
    return this.usersService.listDeleted(query);
  }

  @Get(':id')
  @RequirePermission('user:list')
  @ApiOkResponse({ type: UserVo })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserVo> {
    return this.usersService.findById(id);
  }

  @Post()
  @RequirePermission('user:create')
  @ApiCreatedResponse({ type: UserVo })
  @ApiBody({ type: CreateUserDto })
  create(@Body() body: CreateUserDto): Promise<UserVo> {
    return this.usersService.create(body);
  }

  @Put(':id')
  @RequirePermission('user:update')
  @ApiOkResponse({ type: UserVo })
  @ApiBody({ type: UpdateUserDto })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateUserDto): Promise<UserVo> {
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('user:delete')
  @ApiOkResponse({ type: UserVo })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserVo> {
    return this.usersService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermission('global:trash:restore')
  @ApiOkResponse({ type: UserVo })
  restore(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserVo> {
    return this.usersService.restore(id);
  }

  @Delete(':id/hard')
  @RequirePermission('global:trash:hard_delete')
  @ApiOkResponse({ description: '彻底删除（硬删）' })
  hardRemove(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserVo> {
    return this.usersService.hardRemove(id);
  }
}
