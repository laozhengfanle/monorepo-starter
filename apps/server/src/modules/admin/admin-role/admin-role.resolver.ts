/**
 * 管理端角色 GraphQL Resolver
 *
 * Query:
 * - adminRoles(enabled): 角色列表（含 menuCount + menuIds）
 * - adminRole(id): 单个角色
 *
 * Mutation:
 * - createAdminRole / updateAdminRole / deleteAdminRole
 * - assignRoleMenus(roleId, menuIds)
 *
 * 权限码：
 * - iam:role:list / iam:role:create / iam:role:update / iam:role:delete
 */
import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import {
    CreateAdminRoleSchema,
    UpdateAdminRoleSchema,
    AssignRoleMenusSchema,
    UuidSchema,
    type CreateAdminRoleInput,
    type UpdateAdminRoleInput,
} from '@packages/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from '../../../common/guards/admin-permission.guard.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { ZodArgsPipe } from '../../../common/pipes/zod-args.pipe.js';
import { AdminRole } from './admin-role.type.js';
import { CreateAdminRoleInput as CreateAdminRoleInputType } from './admin-role.input.js';
import { UpdateAdminRoleInput as UpdateAdminRoleInputType } from './admin-role.input.js';
import { AssignRoleMenusInput as AssignRoleMenusInputType } from './admin-role.input.js';
import { AdminRoleService } from './admin-role.service.js';

interface GraphQLContext {
    req: { user: { accountId: string; userType: string } };
}

@Resolver(() => AdminRole)
@RequireAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class AdminRoleResolver {
    constructor(private readonly roleService: AdminRoleService) {}

    /**
     * 角色列表查询
     * - enabled=null（默认）：不过滤启用状态
     * - enabled=true/false：按 enabled 字段筛选（前端状态字段 '正常/禁用'）
     */
    @Query(() => [AdminRole], {
        description: '查询所有角色（含 menuCount + menuIds）',
    })
    @Permission('iam:role:view')
    async adminRoles(
        @Args('enabled', { type: () => Boolean, nullable: true, defaultValue: null })
        enabled: boolean | null,
    ): Promise<AdminRole[]> {
        return this.roleService.findAll(enabled ?? undefined);
    }

    /**
     * 单条查询（参数 id 走 Zod UUID 验证）
     * 注意：id 显式声明 nullable: false，与 schema.gql 中 id: ID! 一致
     */
    @Query(() => AdminRole, { description: '查询单个角色（含 menuIds）' })
    @Permission('iam:role:view')
    async adminRole(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
    ): Promise<AdminRole> {
        return this.roleService.findById(id);
    }

    /**
     * 创建角色
     * 注意：input 显式声明 nullable: false，与 schema.gql 中 input: CreateAdminRoleInput! 一致
     */
    @Mutation(() => AdminRole, { description: '创建角色' })
    @Permission('iam:role:create')
    async createAdminRole(
        @Args(
            'input',
            { type: () => CreateAdminRoleInputType, nullable: false },
            new ZodArgsPipe(CreateAdminRoleSchema),
        )
        input: CreateAdminRoleInput,
        @Context() ctx: GraphQLContext,
    ): Promise<AdminRole> {
        return this.roleService.create(input, ctx.req.user.accountId);
    }

    /**
     * 更新角色基本信息
     * 注意：id 和 input 都显式声明 nullable: false，与 schema.gql 一致
     */
    @Mutation(() => AdminRole, { description: '更新角色基本信息' })
    @Permission('iam:role:update')
    async updateAdminRole(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Args(
            'input',
            { type: () => UpdateAdminRoleInputType, nullable: false },
            new ZodArgsPipe(UpdateAdminRoleSchema),
        )
        input: UpdateAdminRoleInput,
        @Context() ctx: GraphQLContext,
    ): Promise<AdminRole> {
        return this.roleService.update(id, input, ctx.req.user.accountId);
    }

    /**
     * 删除角色（硬删除，super_admin 不可删）
     * 注意：id 显式声明 nullable: false，与 schema.gql 一致
     */
    @Mutation(() => Boolean, { description: '删除角色（super_admin 不可删）' })
    @Permission('iam:role:delete')
    async deleteAdminRole(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Context() ctx: GraphQLContext,
    ): Promise<boolean> {
        await this.roleService.delete(id, ctx.req.user.accountId);
        return true;
    }

    /**
     * 分配角色菜单（先删后插）
     * 注意：input 显式声明 nullable: false，与 schema.gql 一致
     */
    @Mutation(() => Boolean, { description: '分配角色菜单（先删后插）' })
    @Permission('iam:role:update')
    async assignRoleMenus(
        @Args(
            'input',
            { type: () => AssignRoleMenusInputType, nullable: false },
            new ZodArgsPipe(AssignRoleMenusSchema),
        )
        input: {
            roleId: string;
            menuIds: string[];
        },
        @Context() ctx: GraphQLContext,
    ): Promise<boolean> {
        await this.roleService.assignMenus(input.roleId, input.menuIds, ctx.req.user.accountId);
        return true;
    }
}
