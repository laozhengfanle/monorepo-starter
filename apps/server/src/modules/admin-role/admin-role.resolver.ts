import { Args, Field, ID, InputType, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CreateRoleSchema, UpdateRoleSchema } from '@starter/contracts';
import type { AdminRole, CreateRoleInput, PermissionCode, UpdateRoleInput } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { AdminRoleService } from './admin-role.service.js';

/** 角色（GraphQL 薄壳） */
@ObjectType('AdminRole')
export class AdminRoleType implements AdminRole {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  code!: string;

  @Field(() => String)
  description!: string;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => [String])
  permissionCodes!: string[];

  @Field(() => String)
  createdAt!: string;
}

/** 权限点（GraphQL 薄壳） */
@ObjectType('PermissionCode')
export class PermissionCodeType implements PermissionCode {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  code!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  type!: string;
}

/** 创建角色入参（GraphQL 薄壳） */
@InputType('CreateRoleInput')
export class CreateRoleInputType implements CreateRoleInput {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  code!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => [String], { nullable: true })
  permissionCodes?: string[];
}

/** 更新角色入参（GraphQL 薄壳） */
@InputType('UpdateRoleInput')
export class UpdateRoleInputType implements UpdateRoleInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => [String], { nullable: true })
  permissionCodes?: string[];
}

/** 角色管理 GraphQL Resolver（权限 role:*） */
@Resolver(() => AdminRoleType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AdminRoleResolver {
  constructor(
    private readonly adminRoleService: AdminRoleService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => [AdminRoleType])
  @RequirePermission('role:list')
  async adminRoles(): Promise<AdminRoleType[]> {
    return this.adminRoleService.list();
  }

  /** 全部权限点（分配角色权限用） */
  @Query(() => [PermissionCodeType])
  @RequirePermission('role:list')
  async permissionCodes(): Promise<PermissionCodeType[]> {
    return this.prisma.client.adminMenu.findMany({
      where: { enabled: true },
      orderBy: { sort: 'asc' },
    });
  }

  @Mutation(() => AdminRoleType)
  @RequirePermission('role:create')
  async createRole(
    @Args('input', { type: () => CreateRoleInputType }, new ZodArgsPipe(CreateRoleSchema))
    input: CreateRoleInputType,
  ): Promise<AdminRoleType> {
    return this.adminRoleService.create(input as never);
  }

  @Mutation(() => AdminRoleType)
  @RequirePermission('role:update')
  async updateRole(
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateRoleInputType }, new ZodArgsPipe(UpdateRoleSchema))
    input: UpdateRoleInputType,
  ): Promise<AdminRoleType> {
    return this.adminRoleService.update(id, input as never);
  }

  @Mutation(() => AdminRoleType)
  @RequirePermission('role:delete')
  async deleteRole(@Args('id', { type: () => ID }) id: string): Promise<AdminRoleType> {
    return this.adminRoleService.remove(id);
  }
}
