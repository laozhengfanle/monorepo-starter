/**
 * 账户菜单特例授权 GraphQL Resolver
 *
 * Query:
 * - accountMenus(accountId): 查询某账户的特例授权列表
 *
 * Mutation:
 * - saveAccountMenus(accountId, overrides): 全量替换特例授权（先删后插）
 *
 * 权限码：iam:admin:update
 */
import { UseGuards } from '@nestjs/common';
import { Args, Field, ID, InputType, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from '../../../common/guards/admin-permission.guard.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { newId } from '@packages/shared';
import { AdminPermissionCacheService } from '../admin-permission-cache.service.js';
import { AccountMenuRow, AccountMenuOverrideResult } from './account-menu.type.js';

@InputType('AccountMenuOverrideInput')
class AccountMenuOverrideInput {
    @Field(() => ID)
    menuId!: string;

    @Field({ description: 'grant 或 deny' })
    type!: string;
}

@Resolver(() => AccountMenuRow)
@RequireAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class AccountMenuResolver {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: AdminPermissionCacheService,
    ) {}

    /**
     * @description 查询账户特例授权列表（账户→菜单的 grant/deny 覆盖）
     * @param accountId - 账户 ID
     * @returns AccountMenuRow[] 特例授权列表
     * @example await resolver.accountMenus('account-uuid')
     */
    @Query(() => [AccountMenuRow], { description: '查询账户特例授权列表' })
    @Permission('iam:admin:update')
    async accountMenus(@Args('accountId', { type: () => ID }) accountId: string): Promise<AccountMenuRow[]> {
        const rows = await this.prisma.client.adminAccountMenu.findMany({
            where: { accountId },
            include: { menu: { select: { name: true } } },
        });
        return rows.map((r) => ({
            id: r.id,
            accountId: r.accountId,
            menuId: r.menuId,
            menuName: r.menu.name ?? '',
            type: r.type,
        }));
    }

    /**
     * @description 全量替换账户特例授权（事务：先删后插），并失效该账户的认证缓存
     * @param accountId - 账户 ID
     * @param overrides - 特例授权列表，每项含 menuId + type(grant/deny)
     * @returns AccountMenuOverrideResult 是否成功
     * @example await resolver.saveAccountMenus('account-uuid', [{ menuId: 'm1', type: 'grant' }])
     */
    @Mutation(() => AccountMenuOverrideResult, { description: '全量替换账户特例授权' })
    @Permission('iam:admin:update')
    async saveAccountMenus(
        @Args('accountId', { type: () => ID }) accountId: string,
        @Args('overrides', { type: () => [AccountMenuOverrideInput] })
        overrides: { menuId: string; type: string }[],
    ): Promise<{ success: boolean }> {
        await this.prisma.client.$transaction(async (tx) => {
            await tx.adminAccountMenu.deleteMany({ where: { accountId } });
            if (overrides.length > 0) {
                await tx.adminAccountMenu.createMany({
                    data: overrides.map((o) => ({
                        id: newId(),
                        accountId,
                        menuId: o.menuId,
                        type: o.type,
                    })),
                });
            }
        });

        /** 特例授权变更后，失效该账户的认证缓存，确保权限立即生效 */
        await this.cacheService.invalidateAccount(accountId);

        return { success: true };
    }
}
