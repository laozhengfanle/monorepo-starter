import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CreateUserSchema, UpdateUserSchema } from '@starter/contracts';
import type { UserVo } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard.js';
import { PermissionGuard } from '../modules/auth/permission.guard.js';
import { RequirePermission } from '../modules/auth/permission.decorator.js';
import { UsersService } from './users.service.js';
import { PaginatedUsersType, UserType } from './user.type.js';
import { CreateUserInputType } from './create-user.input.js';
import { UpdateUserInputType } from './update-user.input.js';

/**
 * 用户 GraphQL Resolver（阶段 2 契约层 + 阶段 3 RBAC）。
 *
 * - @Args 输入经 ZodArgsPipe 校验（zod 单一来源）
 * - 返回 GraphQL 薄壳类型（UserType / CreateUserInputType），字段形状与 zod 对齐
 * - JWT 认证 + 权限点校验（JwtAuthGuard + PermissionGuard + @RequirePermission）
 */
@Resolver(() => UserType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => PaginatedUsersType)
  @RequirePermission('user:list')
  async users(
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, nullable: true, defaultValue: 20 }) pageSize: number,
  ): Promise<PaginatedUsersType> {
    const result = await this.usersService.list({ page, pageSize });
    return {
      items: result.items as UserType[],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @Query(() => UserType, { nullable: true })
  @RequirePermission('user:list')
  async user(@Args('id', { type: () => ID }) id: string): Promise<UserType | null> {
    return (await this.usersService.findById(id)) as UserType;
  }

  @Mutation(() => UserType)
  @RequirePermission('user:create')
  async createUser(
    @Args('input', { type: () => CreateUserInputType }, new ZodArgsPipe(CreateUserSchema))
    input: CreateUserInputType,
  ): Promise<UserType> {
    return (await this.usersService.create(input as UserVo)) as UserType;
  }

  @Mutation(() => UserType)
  @RequirePermission('user:update')
  async updateUser(
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateUserInputType }, new ZodArgsPipe(UpdateUserSchema))
    input: UpdateUserInputType,
  ): Promise<UserType> {
    return (await this.usersService.update(id, input as UserVo)) as UserType;
  }

  @Mutation(() => UserType)
  @RequirePermission('user:delete')
  async deleteUser(@Args('id', { type: () => ID }) id: string): Promise<UserType> {
    return (await this.usersService.remove(id)) as UserType;
  }
}
