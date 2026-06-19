/**
 * 管理端菜单 GraphQL Resolver
 *
 * Query:
 * - adminMenus: 扁平列表
 * - adminMenuTree: 树形结构
 * - adminMenuOptions: 扁平选项（角色分配弹窗）
 * - adminMenu(id): 单条
 *
 * Mutation:
 * - createAdminMenu / updateAdminMenu / deleteAdminMenu
 *
 * 权限码：
 * - iam:menu:list / iam:menu:create / iam:menu:update / iam:menu:delete
 */
import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import { LoginOnly } from '../../../common/decorators/login-only.decorator.js';
import {
    CreateAdminMenuSchema,
    UpdateAdminMenuSchema,
    UuidSchema,
    type CreateAdminMenuInput,
    type UpdateAdminMenuInput,
} from '@packages/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from '../../../common/guards/admin-permission.guard.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { ZodArgsPipe } from '../../../common/pipes/zod-args.pipe.js';
import { AdminMenu, AdminMenuNode, CurrentAdminMenus } from './admin-menu.type.js';
import { CreateAdminMenuInput as CreateAdminMenuInputType } from './admin-menu.input.js';
import { UpdateAdminMenuInput as UpdateAdminMenuInputType } from './admin-menu.input.js';
import { AdminMenuService } from './admin-menu.service.js';
import type { DataLoaders } from '../../../common/dataloader/index.js';

interface GraphQLContext {
    req: { user: { accountId: string; userType: string } };
    dataloaders?: DataLoaders;
}

@Resolver(() => AdminMenu)
@RequireAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class AdminMenuResolver {
    constructor(private readonly menuService: AdminMenuService) {}

    @Query(() => [AdminMenu], { description: '查询扁平菜单列表' })
    @Permission('iam:menu:view')
    async adminMenus(): Promise<AdminMenu[]> {
        return this.menuService.findAll();
    }

    /**
     * @description 查询菜单树（前端动态路由用）
     * @returns AdminMenuNode[] 树形结构
     * @example await resolver.adminMenuTree(ctx)
     */
    @Query(() => [AdminMenuNode], { description: '查询菜单树（前端动态路由用）' })
    @Permission('iam:menu:view')
    async adminMenuTree(@Context() ctx: GraphQLContext): Promise<AdminMenuNode[]> {
        // 优先用 DataLoader（消除子菜单查询的 N+1）
        // - dataloader 已挂在 context 上时（REQUEST scope）→ 走 dataloader 路径
        // - 没挂时 → 走 findTree() 全量查（向后兼容）
        if (ctx.dataloaders?.menuByParentId) {
            return this.menuService.findTreeByDataLoader(ctx.dataloaders.menuByParentId);
        }
        return this.menuService.findTree();
    }

    /**
     * @description 菜单选项列表（角色分配弹窗）
     * @returns AdminMenu[] 扁平选项列表
     * @example await resolver.adminMenuOptions()
     */
    @Query(() => [AdminMenu], { description: '菜单选项列表（角色分配弹窗）' })
    @Permission('iam:menu:view')
    async adminMenuOptions(): Promise<AdminMenu[]> {
        return this.menuService.findOptions();
    }

    /**
     * 当前账户的菜单树 + 权限码（登录后查询）
     * - 仅校验登录态，不要求具体权限码（任何登录账户都能查自己菜单）
     * - 与前端 api/menus.ts 的 getCurrentUserMenus() 对应
     */
    @Query(() => CurrentAdminMenus, { description: '当前账户的菜单树 + 权限码' })
    @LoginOnly()
    async currentAdminMenus(@Context() ctx: GraphQLContext): Promise<CurrentAdminMenus> {
        const { accountId } = ctx.req.user;
        return this.menuService.getCurrentAccountMenus(accountId);
    }

    /**
     * 查询单个菜单
     * 注意：id 显式声明 nullable: false，与 schema.gql 中 id: ID! 一致
     */
    @Query(() => AdminMenu, { description: '查询单个菜单' })
    @Permission('iam:menu:view')
    async adminMenu(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
    ): Promise<AdminMenu> {
        return this.menuService.findById(id);
    }

    /**
     * 创建菜单
     * 注意：input 显式声明 nullable: false，与 schema.gql 中 input: CreateAdminMenuInput! 一致
     */
    @Mutation(() => AdminMenu, { description: '创建菜单' })
    @Permission('iam:menu:create')
    async createAdminMenu(
        @Args(
            'input',
            { type: () => CreateAdminMenuInputType, nullable: false },
            new ZodArgsPipe(CreateAdminMenuSchema),
        )
        input: CreateAdminMenuInput,
        @Context() ctx: GraphQLContext,
    ): Promise<AdminMenu> {
        return this.menuService.create(input, ctx.req.user.accountId);
    }

    /**
     * 更新菜单
     * 注意：id 和 input 都显式声明 nullable: false，与 schema.gql 一致
     */
    @Mutation(() => AdminMenu, { description: '更新菜单' })
    @Permission('iam:menu:update')
    async updateAdminMenu(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Args(
            'input',
            { type: () => UpdateAdminMenuInputType, nullable: false },
            new ZodArgsPipe(UpdateAdminMenuSchema),
        )
        input: UpdateAdminMenuInput,
        @Context() ctx: GraphQLContext,
    ): Promise<AdminMenu> {
        return this.menuService.update(id, input, ctx.req.user.accountId);
    }

    /**
     * 删除菜单（硬删除，不可恢复）
     * 注意：id 显式声明 nullable: false，与 schema.gql 中 id: ID! 一致
     */
    @Mutation(() => Boolean, { description: '删除菜单（有子节点不能删）' })
    @Permission('iam:menu:delete')
    async deleteAdminMenu(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Context() ctx: GraphQLContext,
    ): Promise<boolean> {
        await this.menuService.delete(id, ctx.req.user.accountId);
        return true;
    }
}
