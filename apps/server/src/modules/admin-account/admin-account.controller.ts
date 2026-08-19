import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SaveAccountMenusDto } from '@starter/server-core';
import type { AccountMenusResult, AdminAccount } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { AuthAccount } from '../auth/auth.types.js';
import { AdminAccountService } from './admin-account.service.js';

/**
 * 管理端账户 REST 端点（BFF 胶水层，仅保留前端真实使用的操作类端点）：
 * - 账户 CRUD 前端走 GraphQL（adminAccounts / createAdminAccount / ...）
 * - 这里只保留 GraphQL 不适合或更优雅的 REST 场景：
 *   - POST :id/restore / DELETE :id/hard：软删除恢复/彻底删除（操作类）
 *   - GET/PUT :id/menus：账户特例授权（grant/deny 覆写）
 */
@ApiTags('admin-accounts')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/accounts')
export class AdminAccountController {
  constructor(private readonly adminAccountService: AdminAccountService) {}

  @Post(':id/restore')
  @RequirePermission('global:trash:restore')
  @ApiOkResponse({ description: '恢复已软删账户' })
  restore(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccount() account: AuthAccount,
  ): Promise<AdminAccount> {
    return this.adminAccountService.restore(id, account.accountId);
  }

  @Delete(':id/hard')
  @RequirePermission('global:trash:hard_delete')
  @ApiOkResponse({ description: '彻底删除（清级联表后硬删）' })
  hardRemove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccount() account: AuthAccount,
  ): Promise<AdminAccount> {
    return this.adminAccountService.hardRemove(id, account.accountId);
  }

  @Get(':id/menus')
  @RequirePermission('account:update')
  @ApiOkResponse({ description: '账户特例授权（覆盖 + 角色基线菜单）' })
  getAccountMenus(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AccountMenusResult> {
    return this.adminAccountService.getAccountMenus(id);
  }

  @Put(':id/menus')
  @RequirePermission('account:update')
  @ApiOkResponse({ description: '保存账户特例授权（全量覆盖）' })
  @ApiBody({ type: SaveAccountMenusDto })
  saveAccountMenus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SaveAccountMenusDto,
    @CurrentAccount() account: AuthAccount,
  ): Promise<AccountMenusResult> {
    return this.adminAccountService.saveAccountMenus(
      id,
      body,
      account.accountId,
    );
  }
}
