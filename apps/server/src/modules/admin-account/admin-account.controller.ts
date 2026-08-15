import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminAccountVo,
  CreateAdminAccountDto,
  QueryAdminAccountsDto,
  UpdateAdminAccountDto,
} from '@starter/server-core';
import type { AdminAccount, PaginatedData } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { AdminAccountService } from './admin-account.service.js';

/**
 * 管理端账户 REST 端点（阶段 3 扩展）：
 * JWT 认证 + 权限点（account:list/create/update/delete）
 */
@ApiTags('admin-accounts')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/accounts')
export class AdminAccountController {
  constructor(private readonly adminAccountService: AdminAccountService) {}

  @Get()
  @RequirePermission('account:list')
  @ApiOkResponse({ type: AdminAccountVo, isArray: true })
  list(@Query() query: QueryAdminAccountsDto): Promise<PaginatedData<AdminAccount>> {
    return this.adminAccountService.list(query);
  }

  @Post()
  @RequirePermission('account:create')
  @ApiCreatedResponse({ type: AdminAccountVo })
  @ApiBody({ type: CreateAdminAccountDto })
  create(@Body() body: CreateAdminAccountDto): Promise<AdminAccount> {
    return this.adminAccountService.create(body);
  }

  @Put(':id')
  @RequirePermission('account:update')
  @ApiOkResponse({ type: AdminAccountVo })
  @ApiBody({ type: UpdateAdminAccountDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAdminAccountDto,
  ): Promise<AdminAccount> {
    return this.adminAccountService.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('account:delete')
  @ApiOkResponse({ type: AdminAccountVo })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminAccount> {
    return this.adminAccountService.remove(id);
  }
}
