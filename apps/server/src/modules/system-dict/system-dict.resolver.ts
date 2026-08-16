import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import {
  CreateDictItemSchema,
  CreateDictTypeSchema,
  UpdateDictItemSchema,
  UpdateDictTypeSchema,
} from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SysDictService } from './system-dict.service.js';
import {
  CreateDictItemInputType,
  CreateDictTypeInputType,
  SysDictItemType,
  SysDictTypeType,
  UpdateDictItemInputType,
  UpdateDictTypeInputType,
} from './system-dict.type.js';

/** 数据字典 GraphQL Resolver（权限 config:dict:*） */
@Resolver(() => SysDictTypeType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SysDictResolver {
  constructor(private readonly sysDictService: SysDictService) {}

  @Query(() => [SysDictTypeType])
  @RequirePermission('config:dict:view')
  async sysDictTypes(): Promise<SysDictTypeType[]> {
    return this.sysDictService.listTypes();
  }

  @Mutation(() => SysDictTypeType)
  @RequirePermission('config:dict:update')
  async createDictType(
    @Args('input', { type: () => CreateDictTypeInputType }, new ZodArgsPipe(CreateDictTypeSchema))
    input: CreateDictTypeInputType,
    @CurrentUser() user: AuthUser,
  ): Promise<SysDictTypeType> {
    return this.sysDictService.createType(input as never, user.accountId);
  }

  @Mutation(() => SysDictTypeType)
  @RequirePermission('config:dict:update')
  async updateDictType(
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateDictTypeInputType }, new ZodArgsPipe(UpdateDictTypeSchema))
    input: UpdateDictTypeInputType,
    @CurrentUser() user: AuthUser,
  ): Promise<SysDictTypeType> {
    return this.sysDictService.updateType(id, input as never, user.accountId);
  }

  @Mutation(() => Boolean)
  @RequirePermission('config:dict:update')
  async deleteDictType(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<boolean> {
    await this.sysDictService.removeType(id, user.accountId);
    return true;
  }

  @Mutation(() => SysDictItemType)
  @RequirePermission('config:dict:update')
  async createDictItem(
    @Args('input', { type: () => CreateDictItemInputType }, new ZodArgsPipe(CreateDictItemSchema))
    input: CreateDictItemInputType,
    @CurrentUser() user: AuthUser,
  ): Promise<SysDictItemType> {
    return this.sysDictService.createItem(input as never, user.accountId);
  }

  @Mutation(() => SysDictItemType)
  @RequirePermission('config:dict:update')
  async updateDictItem(
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateDictItemInputType }, new ZodArgsPipe(UpdateDictItemSchema))
    input: UpdateDictItemInputType,
    @CurrentUser() user: AuthUser,
  ): Promise<SysDictItemType> {
    return this.sysDictService.updateItem(id, input as never, user.accountId);
  }

  @Mutation(() => Boolean)
  @RequirePermission('config:dict:update')
  async deleteDictItem(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<boolean> {
    await this.sysDictService.removeItem(id, user.accountId);
    return true;
  }
}
