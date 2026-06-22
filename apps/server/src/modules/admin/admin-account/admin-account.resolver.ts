/**
 * 管理端账户 GraphQL Resolver
 *
 * Query:
 * - adminAccounts(input): 分页查询（input.includeDeleted=true 时含已软删）
 * - adminAccount(id): 单条查询
 *
 * Mutation:
 * - createAdminAccount(input)
 * - updateAdminAccount(id, input)
 * - deleteAdminAccount(id)
 * - hardDeleteAdminAccount(id): 彻底删除已软删的账户
 * - restoreAdminAccount(id): 恢复已软删的账户
 * - assignAdminAccountRoles(accountId, roleIds)
 *
 * 权限码：
 * - iam:admin:list
 * - iam:admin:create
 * - iam:admin:update
 * - iam:admin:delete
 * - global:trash:list（硬删 / 恢复）
 *
 * 注意事项：
 * - 所有输入用 @Args() + ZodArgsPipe 验证（与 REST 端点共用 schema）
 * - 所有 mutation 必须有 @Permission() 装饰器（AdminPermissionGuard 强制）
 * - 内部用 ClassGuard 检查；GraphQL 入口依赖 APP_GUARD
 */
import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import {
    CreateAdminAccountSchema,
    UpdateAdminAccountSchema,
    QueryAdminAccountSchema,
    UuidSchema,
    AssignAdminAccountRolesSchema,
    ResetAdminPasswordSchema,
    type CreateAdminAccountInput,
    type UpdateAdminAccountInput,
    type QueryAdminAccountInput,
    type ResetAdminPasswordInput,
} from '@packages/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from '../../../common/guards/admin-permission.guard.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { ZodArgsPipe } from '../../../common/pipes/zod-args.pipe.js';
import { Paginated, type PaginatedType } from '../../graphql/common/pagination.type.js';
import { LoginLockIntegration } from '../../auth/login-lock-integration.js';
import { AdminAccount } from './admin-account.type.js';
import { CreateAdminAccountInput as CreateAdminAccountInputType } from './admin-account.input.js';
import { UpdateAdminAccountInput as UpdateAdminAccountInputType } from './admin-account.input.js';
import { QueryAdminAccountInput as QueryAdminAccountInputType } from './admin-account.input.js';
import { AssignAdminAccountRolesInput as AssignAdminAccountRolesInputType } from './admin-account.input.js';
import { ResetAdminAccountPasswordInput as ResetAdminAccountPasswordInputType } from './admin-account.input.js';
import { AdminAccountService } from './admin-account.service.js';
import type { DataLoaders } from '../../../common/dataloader/index.js';

const PaginatedAdminAccount = Paginated(AdminAccount, 'PaginatedAdminAccount');

interface GraphQLContext {
    req: { user: { accountId: string; userType: string } };
    dataloaders?: DataLoaders;
}

@Resolver(() => AdminAccount)
@RequireAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class AdminAccountResolver {
    constructor(
        private readonly accountService: AdminAccountService,
        private readonly loginLock: LoginLockIntegration,
    ) {}

    /**
     * 分页查询管理员账户
     * - input.includeDeleted: true 时含已软删，false（默认）只返回活跃行
     * - ctx.dataloaders 存在时启用 DataLoader 增强版（返回 permissionsCountByAccountId）
     */
    @Query(() => PaginatedAdminAccount, { description: '分页查询管理员账户（includeDeleted=true 时含已软删）' })
    @Permission('iam:admin:view')
    async adminAccounts(
        @Context() ctx: GraphQLContext,
        @Args(
            'input',
            { type: () => QueryAdminAccountInputType, nullable: true },
            new ZodArgsPipe(QueryAdminAccountSchema),
        )
        input: QueryAdminAccountInput,
    ): Promise<PaginatedType<AdminAccount>> {
        const params = input ?? { page: 1, pageSize: 20 };
        // dataloader 路径（额外返回权限数）
        if (ctx.dataloaders) {
            const r = await this.accountService.findAllWithDataLoader(ctx.dataloaders, params);
            // 当前 GraphQL 端点签名只暴露 AdminAccount 列表，permissionsCount 不返回但已被 dataloader batch 准备好
            // 未来若需要把 permissionsCount 暴露到 GraphQL，可加一个新 type 字段
            return { items: r.items, total: r.total, page: r.page, pageSize: r.pageSize };
        }
        return this.accountService.findAll(params);
    }

    /**
     * 单条查询（参数 id 走 Zod UUID 验证）
     * 注意：@Args('id', { type: () => ID, nullable: false }) 显式声明非空，与 schema.gql 中 id: ID! 一致
     */
    @Query(() => AdminAccount, { description: '查询单个管理员账户（含角色码）' })
    @Permission('iam:admin:view')
    async adminAccount(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema))
        id: string,
    ): Promise<AdminAccount> {
        return this.accountService.findById(id);
    }

    /**
     * 字段级 resolver：账号是否被登录失败计数锁定
     * - 走 LoginLockIntegration.isLocked（账号级检查）
     * - 传空 IP 字符串：只查账号级，不被 IP 维度污染
     * - 列表场景 N+1：每行一次 Redis 读，后续可用 DataLoader 批量优化
     * - 权限：复用 AdminAccount 自身的 iam:admin:view（与父对象一致）
     */
    @ResolveField('isLocked', () => Boolean, {
        description: '账号是否被登录失败计数锁定（true=被锁）',
    })
    async isLocked(@Parent() account: AdminAccount): Promise<boolean> {
        // 传空 ip 字符串：只查账号级（不查 IP 维度）
        return this.loginLock.isLocked(account.id, '');
    }

    /**
     * 创建管理员账户
     * 注意：@Args('input', { nullable: false }) 显式声明非空，与 schema.gql 中 input: CreateAdminAccountInput! 一致
     * 修复：@nestjs/graphql 13.4.2 默认 @Args() 为 nullable: true，导致运行时与生成的 schema 不一致
     */
    @Mutation(() => AdminAccount, { description: '创建管理员账户' })
    @Permission('iam:admin:create')
    async createAdminAccount(
        @Args(
            'input',
            { type: () => CreateAdminAccountInputType, nullable: false },
            new ZodArgsPipe(CreateAdminAccountSchema),
        )
        input: CreateAdminAccountInput,
    ): Promise<AdminAccount> {
        return this.accountService.create(input);
    }

    /**
     * 更新管理员账户
     * 注意：id 和 input 都显式声明 nullable: false，与 schema.gql 一致
     */
    @Mutation(() => AdminAccount, { description: '更新管理员账户（支持角色重分配）' })
    @Permission('iam:admin:update')
    async updateAdminAccount(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Args(
            'input',
            { type: () => UpdateAdminAccountInputType, nullable: false },
            new ZodArgsPipe(UpdateAdminAccountSchema),
        )
        input: UpdateAdminAccountInput,
    ): Promise<AdminAccount> {
        return this.accountService.update(id, input);
    }

    /**
     * 删除管理员账户（软删除）
     * 注意：id 显式声明 nullable: false，与 schema.gdl 中 id: ID! 一致
     */
    @Mutation(() => Boolean, { description: '软删除管理员账户（最后一个超管不能删）' })
    @Permission('iam:admin:delete')
    async deleteAdminAccount(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
    ): Promise<boolean> {
        await this.accountService.delete(id);
        return true;
    }

    /**
     * 彻底删除管理员账户（物理删除已软删账户的所有级联表行）
     * - 前置校验：行存在 + adminProfile.deletedAt IS NOT NULL
     * - 行为：事务内删 adminAccountMenu/adminAccountRole/adminProfile/accountIdentity/account
     * - 权限码：global:trash:list
     */
    @Mutation(() => Boolean, { description: '彻底删除已软删除的管理员账户（物理删除）' })
    @Permission('global:trash:view')
    async hardDeleteAdminAccount(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Context() ctx: GraphQLContext,
    ): Promise<boolean> {
        await this.accountService.hardDelete(id, ctx.req.user.accountId);
        return true;
    }

    /**
     * 恢复已软删除的管理员账户
     * - 前置校验：行存在 + adminProfile.deletedAt IS NOT NULL
     * - 唯一冲突预查：当前活跃账户里若有同 username，抛 ConflictException
     * - 行为：事务内把 adminProfile 和 account 的 deletedAt 置 NULL
     * - 权限码：global:trash:list
     */
    @Mutation(() => Boolean, { description: '恢复已软删除的管理员账户' })
    @Permission('global:trash:view')
    async restoreAdminAccount(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Context() ctx: GraphQLContext,
    ): Promise<boolean> {
        await this.accountService.restore(id, ctx.req.user.accountId);
        return true;
    }

    /**
     * 分配角色（仅修改角色，不动 profile）
     * 注意：input 显式声明 nullable: false，与 schema.gql 一致
     */
    @Mutation(() => AdminAccount, { description: '重新分配账户的角色（删旧 + 插新）' })
    @Permission('iam:admin:update')
    async assignAdminAccountRoles(
        @Args(
            'input',
            { type: () => AssignAdminAccountRolesInputType, nullable: false },
            new ZodArgsPipe(AssignAdminAccountRolesSchema),
        )
        input: {
            accountId: string;
            roleIds: string[];
        },
    ): Promise<AdminAccount> {
        return this.accountService.assignRoles(input.accountId, input.roleIds);
    }

    /**
     * 重置管理员密码
     * - 强制改密，不要求旧密码（典型场景：用户忘记密码 / 安全事件强制改密）
     * - 前端用 NInput.Password 录入，前端做"再次输入"一致性检查
     * - 后端用 ResetAdminPasswordSchema 二次校验（复杂度 + 两次输入一致）
     * - 权限：沿用 iam:admin:update（重置密码已合并到编辑弹窗的"密码字段"，
     *   改密是编辑的子操作，没必要单独一个权限码 ——
     *   否则有 update 没 reset_password 的 admin 会进编辑弹窗 + 改资料成功
     *   + 改密抛 ForbiddenException 出现"部分成功"的迷惑提示）
     * - 调用方仍需登录（@RequireAuth 来自 AppModule 全局守卫）
     */
    @Mutation(() => Boolean, { description: '重置管理员密码（强制改密，不要求旧密码）' })
    @Permission('iam:admin:update')
    async resetAdminAccountPassword(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Args(
            'input',
            { type: () => ResetAdminAccountPasswordInputType, nullable: false },
            new ZodArgsPipe(ResetAdminPasswordSchema),
        )
        input: ResetAdminPasswordInput,
        @Context() ctx: GraphQLContext,
    ): Promise<boolean> {
        await this.accountService.resetPassword(id, input.newPassword, ctx.req.user.accountId);
        return true;
    }

    /**
     * 解锁管理员账户（清空登录失败计数）
     * - 区别于 resetAdminAccountPassword：只清锁，不改密、不撤销 token
     * - 场景：用户被 5 次失败锁定 30 分钟，超级管理员要立即恢复其登录（不改密）
     * - 写审计日志：action = account_unlocked
     * - 权限：iam:admin:update（与 resetPassword 同级，因为都是"管理员对账号的强制操作"）
     */
    @Mutation(() => Boolean, { description: '解锁管理员账户（清空登录失败计数）' })
    @Permission('iam:admin:update')
    async unlockAdminAccount(
        @Args('id', { type: () => ID, nullable: false }, new ZodArgsPipe(UuidSchema)) id: string,
        @Context() ctx: GraphQLContext,
    ): Promise<boolean> {
        await this.accountService.unlockAccount(id, ctx.req.user.accountId);
        return true;
    }
}
