import {
  Args,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import {
  AdminAccountQuerySchema,
  CreateAdminAccountSchema,
  UpdateAdminAccountSchema,
} from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { AuthAccount } from '../auth/auth.types.js';
import { AdminAccountService } from './admin-account.service.js';
import {
  AdminAccountType,
  CreateAdminAccountInputType,
  PaginatedAdminAccountsType,
  UpdateAdminAccountInputType,
} from './admin-account.type.js';

/** 账户列表查询参数（AdminAccountQuerySchema 解析后的输出形状） */
type AdminAccountListQuery = {
  page: number;
  pageSize: number;
  /** 按用户名模糊搜索 */
  username?: string;
  /** 按邮箱模糊搜索 */
  email?: string;
  /** 按角色编码精确筛选 */
  roleCode?: string;
  /** 状态筛选：true=正常 / false=禁用 */
  enabled?: boolean;
  /** 是否包含已软删记录 */
  includeDeleted?: boolean;
};

/** 账户列表查询入参（GraphQL 薄壳；默认值与校验由 AdminAccountQuerySchema 兜底） */
@InputType('AdminAccountQueryInput')
class AdminAccountQueryInputType {
  @Field(() => Int, { nullable: true })
  page?: number;

  @Field(() => Int, { nullable: true })
  pageSize?: number;

  @Field(() => String, { nullable: true })
  username?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => String, { nullable: true })
  roleCode?: string;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => Boolean, { nullable: true })
  includeDeleted?: boolean;
}

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
    @Args(
      'query',
      { type: () => AdminAccountQueryInputType },
      new ZodArgsPipe(AdminAccountQuerySchema),
    )
    query: AdminAccountListQuery,
  ): Promise<PaginatedAdminAccountsType> {
    const result = await this.adminAccountService.list(query);
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
    @Args(
      'input',
      { type: () => CreateAdminAccountInputType },
      new ZodArgsPipe(CreateAdminAccountSchema),
    )
    input: CreateAdminAccountInputType,
    @CurrentAccount() account: AuthAccount,
  ): Promise<AdminAccountType> {
    // input 类 implements CreateAdminAccountInput（契约），ZodArgsPipe 已按 schema 解析
    return this.adminAccountService.create(input, account.accountId);
  }

  @Mutation(() => AdminAccountType)
  @RequirePermission('account:update')
  async updateAdminAccount(
    @Args('id', { type: () => ID }) id: string,
    @Args(
      'input',
      { type: () => UpdateAdminAccountInputType },
      new ZodArgsPipe(UpdateAdminAccountSchema),
    )
    input: UpdateAdminAccountInputType,
    @CurrentAccount() account: AuthAccount,
  ): Promise<AdminAccountType> {
    return this.adminAccountService.update(id, input, account.accountId);
  }

  @Mutation(() => AdminAccountType)
  @RequirePermission('account:delete')
  async deleteAdminAccount(
    @Args('id', { type: () => ID }) id: string,
    @CurrentAccount() account: AuthAccount,
  ): Promise<AdminAccountType> {
    return this.adminAccountService.remove(id, account.accountId);
  }
}
