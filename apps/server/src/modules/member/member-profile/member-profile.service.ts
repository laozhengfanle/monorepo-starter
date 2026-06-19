/**
 * C端用户 Profile 服务
 * - 查询和更新 member_profile
 * - 用于 me 查询和个人中心页面
 * - 管理端可调用的硬删/恢复方法（service 层）
 */
import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { AuditService, AUDIT_ACTIONS } from '../../audit/audit.service.js';

@Injectable()
export class MemberProfileService {
    private readonly logger = new Logger(MemberProfileService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AuditService,
    ) {}

    /**
     * 根据 accountId 获取用户 profile
     * @throws NotFoundException profile 不存在时抛出
     */
    async findByAccountId(accountId: string) {
        const profile = await this.prisma.client.memberProfile.findFirst({
            where: { accountId, deletedAt: null },
        });

        if (!profile) {
            throw new NotFoundException('用户档案不存在');
        }

        return profile;
    }

    /**
     * 更新用户 profile
     * - 只更新传入的字段（部分更新）
     * - 不允许修改 accountId 等关键字段
     */
    async update(accountId: string, input: { nickname?: string; avatar?: string; phone?: string }) {
        const profile = await this.findByAccountId(accountId);

        /** 只更新传入的字段 */
        const updateData: Record<string, string> = {};
        if (input.nickname !== undefined) updateData.nickname = input.nickname;
        if (input.avatar !== undefined) updateData.avatar = input.avatar;
        if (input.phone !== undefined) updateData.phone = input.phone;

        if (Object.keys(updateData).length > 0) {
            await this.prisma.client.memberProfile.update({
                where: { id: profile.id },
                data: updateData,
            });
        }

        return this.findByAccountId(accountId);
    }

    /**
     * 分页查询 C 端用户档案（管理端视图）
     * - includeDeleted=false（默认）：只返回未软删除的档案
     * - includeDeleted=true：返回所有行（含已软删除的）
     */
    async findAll(query: { page: number; pageSize: number; includeDeleted?: boolean }) {
        const { page, pageSize, includeDeleted = false } = query;
        const skip = (page - 1) * pageSize;
        const client = includeDeleted ? this.prisma.rawClient : this.prisma.client;
        const [total, items] = await Promise.all([
            client.memberProfile.count({ where: includeDeleted ? {} : { deletedAt: null } }),
            client.memberProfile.findMany({
                where: includeDeleted ? {} : { deletedAt: null },
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
        ]);
        return { items, total, page, pageSize };
    }

    /**
     * 彻底删除 C 端用户档案（硬删）
     * - 前置校验：行存在 + memberProfile.deletedAt IS NOT NULL
     * - 实际删除：事务内清掉所有级联表行
     *   - memberAccountMenu、memberAccountRole、memberProfile、accountIdentity、account
     * - 写审计日志：action = 'account_hard_deleted'
     */
    async hardDelete(id: string, operatorId?: string) {
        /** 1. 校验行存在（绕过软删除拦截以查到已软删的记录） */
        let profile = await this.prisma.rawClient.memberProfile.findUnique({ where: { id } });
        if (!profile) {
            profile = await this.prisma.rawClient.memberProfile.findFirst({ where: { accountId: id } });
        }
        if (!profile) {
            throw new NotFoundException('用户档案不存在');
        }
        const accountId = profile.accountId;
        /** 2. 仅允许彻底删除已软删的记录 */
        if (profile.deletedAt === null) {
            throw new BadRequestException('仅允许彻底删除已软删的记录');
        }

        /**
         * 3. 物理删除所有级联表行（事务）
         * - delete 顺序：先删子表，再删父表（外键 onDelete: Restrict 反向要求）
         * - 子表：memberAccountMenu、memberAccountRole
         * - 父表：memberProfile、accountIdentity、account
         */
        const deletedPhone = await this.prisma.client.$transaction(async (tx) => {
            const identity = await tx.accountIdentity.findFirst({
                where: { accountId, identityType: 'phone' },
                select: { identifier: true },
            });
            await tx.memberAccountMenu.deleteMany({ where: { accountId } });
            await tx.memberAccountRole.deleteMany({ where: { accountId } });
            await tx.memberProfile.delete({ where: { id: profile.id } });
            await tx.accountIdentity.deleteMany({ where: { accountId } });
            await tx.account.delete({ where: { id: accountId } });
            return identity?.identifier;
        });

        /**
         * 写审计日志：action = 'account_hard_deleted'
         * - resourceType 仍为 'member_user'，用 action 区分软删 vs 硬删
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ACCOUNT_HARD_DELETED,
            resourceType: 'member_user',
            resourceId: id,
            detail: { phone: deletedPhone, accountId },
        });

        return { id, deleted: true };
    }

    /**
     * 恢复 C 端用户档案
     * - 前置校验：行存在 + memberProfile.deletedAt IS NOT NULL
     * - 唯一冲突预查：当前活跃账户里是否有同 phone 的 accountIdentity
     * - 实际恢复：事务内把 memberProfile 和 account 的 deletedAt 置 NULL
     * - 写审计日志：action = 'account_restored'
     */
    async restore(id: string, operatorId?: string) {
        /** 1. 校验行存在 */
        let profile = await this.prisma.rawClient.memberProfile.findUnique({ where: { id } });
        if (!profile) {
            profile = await this.prisma.rawClient.memberProfile.findFirst({ where: { accountId: id } });
        }
        if (!profile) {
            throw new NotFoundException('用户档案不存在');
        }
        const accountId = profile.accountId;
        /** 2. 仅允许恢复已软删的记录 */
        if (profile.deletedAt === null) {
            throw new BadRequestException('仅允许恢复已软删的记录');
        }

        /**
         * 3. unique 冲突预查：当前活跃账户里是否有同 phone 的 accountIdentity
         *    - 排除自身 accountId
         */
        const identity = await this.prisma.client.accountIdentity.findFirst({
            where: { accountId, identityType: 'phone' },
        });
        if (identity) {
            const conflict = await this.prisma.client.accountIdentity.findFirst({
                where: {
                    identityType: 'phone',
                    identifier: identity.identifier,
                    account: { deletedAt: null, NOT: { id: accountId } },
                },
            });
            if (conflict) {
                throw new BadRequestException(`手机号 ${identity.identifier} 已被其他记录占用，无法恢复`);
            }
        }

        /** 4. 实际恢复 */
        await this.prisma.client.$transaction(async (tx) => {
            await tx.memberProfile.update({ where: { id: profile.id }, data: { deletedAt: null } });
            await tx.account.update({ where: { id: accountId }, data: { deletedAt: null } });
        });

        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ACCOUNT_RESTORED,
            resourceType: 'member_user',
            resourceId: id,
            detail: { accountId },
        });

        return { id, deleted: false, restored: true };
    }
}
