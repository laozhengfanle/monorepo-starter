import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CreateMenuSchema, UpdateMenuSchema } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { AdminMenuService } from './admin-menu.service.js';
import {
  AdminMenuNodeType,
  CreateMenuInputType,
  UpdateMenuInputType,
} from './admin-menu.type.js';

/** 菜单管理 GraphQL Resolver（权限 menu:*） */
@Resolver(() => AdminMenuNodeType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AdminMenuResolver {
  constructor(private readonly adminMenuService: AdminMenuService) {}

  /** 完整菜单树（菜单管理页 + 角色权限点分配参考） */
  @Query(() => [AdminMenuNodeType])
  @RequirePermission('menu:list')
  async menuTree(): Promise<AdminMenuNodeType[]> {
    return this.adminMenuService.listTree();
  }

  @Mutation(() => AdminMenuNodeType)
  @RequirePermission('menu:create')
  async createMenu(
    @Args('input', { type: () => CreateMenuInputType }, new ZodArgsPipe(CreateMenuSchema))
    input: CreateMenuInputType,
  ): Promise<AdminMenuNodeType> {
    return this.adminMenuService.create(input as never);
  }

  @Mutation(() => AdminMenuNodeType)
  @RequirePermission('menu:update')
  async updateMenu(
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateMenuInputType }, new ZodArgsPipe(UpdateMenuSchema))
    input: UpdateMenuInputType,
  ): Promise<AdminMenuNodeType> {
    return this.adminMenuService.update(id, input as never);
  }

  @Mutation(() => AdminMenuNodeType)
  @RequirePermission('menu:delete')
  async deleteMenu(@Args('id', { type: () => ID }) id: string): Promise<AdminMenuNodeType> {
    return this.adminMenuService.remove(id);
  }
}
