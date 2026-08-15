import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CreateAdminAccountSchema, UpdateAdminAccountSchema } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { AdminAccountService } from './admin-account.service.js';
import {
  AdminAccountType,
  CreateAdminAccountInputType,
  PaginatedAdminAccountsType,
  UpdateAdminAccountInputType,
} from './admin-account.type.js';

/** 管理端账户 GraphQL Resolver：列表 + 创建/更新/删除（RBAC 保护）
 * 注：角色列表查询 adminRoles 由 AdminRoleModule 提供（role:list），
 * 账户管理页的角色下拉同样走该查询。 */
@Resolver(() => AdminAccountType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AdminAccountResolver {
  constructor(private readonly adminAccountService: AdminAccountService) {}

  @Query(() => PaginatedAdminAccountsType)
  @RequirePermission('account:list')
  async adminAccounts(
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, nullable: true, defaultValue: 20 }) pageSize: number,
  ): Promise<PaginatedAdminAccountsType> {
    const result = await this.adminAccountService.list({ page, pageSize });
    return {
      items: result.items as AdminAccountType[],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @Mutation(() => AdminAccountType)
  @RequirePermission('account:create')
  async createAdminAccount(
    @Args('input', { type: () => CreateAdminAccountInputType }, new ZodArgsPipe(CreateAdminAccountSchema))
    input: CreateAdminAccountInputType,
  ): Promise<AdminAccountType> {
    return this.adminAccountService.create(input as never);
  }

  @Mutation(() => AdminAccountType)
  @RequirePermission('account:update')
  async updateAdminAccount(
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateAdminAccountInputType }, new ZodArgsPipe(UpdateAdminAccountSchema))
    input: UpdateAdminAccountInputType,
  ): Promise<AdminAccountType> {
    return this.adminAccountService.update(id, input as never);
  }

  @Mutation(() => AdminAccountType)
  @RequirePermission('account:delete')
  async deleteAdminAccount(@Args('id', { type: () => ID }) id: string): Promise<AdminAccountType> {
    return this.adminAccountService.remove(id);
  }
}
