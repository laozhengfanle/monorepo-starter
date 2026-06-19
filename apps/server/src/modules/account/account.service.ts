import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/**
 * 撞 unique 时的统一文案
 * - 用户名场景：「用户名 X 已被使用」
 * - 手机号场景：「手机号 X 已被使用」
 * - 「X 已被使用（旧记录已删除，可在「显示已删除」视图下找到并彻底删除后重试）」
 */
function identityConflictActiveMessage(identityType: string, identifier: string): string {
    const label = identityType === 'phone' ? '手机号' : '用户名';
    return `${label} ${identifier} 已被使用`;
}
function identityConflictDeletedMessage(identityType: string, identifier: string): string {
    const label = identityType === 'phone' ? '手机号' : '用户名';
    return `${label} ${identifier} 已被使用（旧记录已删除，可在「显示已删除」视图下找到并彻底删除后重试）`;
}

/**
 * 账户服务
 * - 创建账户（事务：account + identity + profile）
 * - 查询账户（按登录标识查找）
 * - 撞 unique 时抛 ConflictException（区分撞活跃 / 撞已删除）
 */
@Injectable()
export class AccountService {
    private readonly logger = new Logger(AccountService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * 按登录标识查找账户
     * - 查 account_identity → 返回 account + identity + profile
     * - 不存在返回 null
     *
     * 注意：findByIdentity 不应被软删除拦截器影响，因为 AccountIdentity 不在 SOFT_DELETE_MODELS
     * - 软删除的是 Account，AccountIdentity 没有 deletedAt
     * - 如果需要查已软删账户对应的 identity，调用方需要在 where 里手动加 account.deletedAt 条件
     */
    async findByIdentity(identityType: string, identifier: string) {
        const identity = await this.prisma.client.accountIdentity.findFirst({
            where: {
                identityType,
                identifier: identifier.trim().toLowerCase(),
            },
            include: {
                account: {
                    include: {
                        adminProfile: true,
                        memberProfile: true,
                    },
                },
            },
        });

        return identity;
    }

    /**
     * 创建管理员账户（事务）
     * - account + account_identity + admin_profile
     * - 由超级管理员调用
     *
     * 撞 unique 预查（撞活跃 / 撞已删除）：
     * - 抛 ConflictException，区分两种文案
     * - 事务内 create 包 try/catch：处理 P2002（并发场景下被另一个请求抢先创建）
     */
    async createAdminAccount(username: string, hashedPassword: string, nickname: string) {
        const lowerUsername = username.trim().toLowerCase();

        /** 预查撞活跃：identityType=username AND identifier=X AND 关联 account 未软删 */
        const active = await this.prisma.client.accountIdentity.findFirst({
            where: {
                identityType: 'username',
                identifier: lowerUsername,
                account: { deletedAt: null },
            },
        });
        if (active) {
            throw new ConflictException(identityConflictActiveMessage('username', username));
        }
        /** 预查撞已删除：identityType=username AND identifier=X AND 关联 account 已软删 */
        const deleted = await this.prisma.client.accountIdentity.findFirst({
            where: {
                identityType: 'username',
                identifier: lowerUsername,
                account: { deletedAt: { not: null } },
            },
        });
        if (deleted) {
            throw new ConflictException(identityConflictDeletedMessage('username', username));
        }

        return this.prisma.client.$transaction(async (tx) => {
            const account = await tx.account.create({
                data: { userType: 'admin', enabled: true } as unknown as Prisma.AccountUncheckedCreateInput,
            });

            try {
                await tx.accountIdentity.create({
                    data: {
                        accountId: account.id,
                        identityType: 'username',
                        identifier: lowerUsername,
                        credential: hashedPassword,
                        verified: true,
                    } as unknown as Prisma.AccountIdentityUncheckedCreateInput,
                });
            } catch (err) {
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                    /** 并发场景：重新做一次预查定位文案 */
                    const target = (err.meta as { target?: string[] })?.target;
                    if (Array.isArray(target) && (target.includes('identityType') || target.includes('identifier'))) {
                        throw new ConflictException(identityConflictActiveMessage('username', username));
                    }
                    throw new ConflictException('创建管理员账户时发生唯一约束冲突');
                }
                throw err;
            }

            await tx.adminProfile.create({
                data: {
                    accountId: account.id,
                    nickname,
                } as unknown as Prisma.AdminProfileUncheckedCreateInput,
            });

            return account;
        });
    }

    /**
     * 创建 C 端用户账户（事务）
     * - account + account_identity + member_profile
     * - 手机号验证码注册
     *
     * 撞 unique 预查（撞活跃 / 撞已删除）：
     * - 抛 ConflictException，区分两种文案
     * - 事务内 create 包 try/catch：处理 P2002（并发场景下被另一个请求抢先创建）
     */
    async createMemberAccount(phone: string, nickname?: string) {
        const trimmedPhone = phone.trim();

        /** 预查撞活跃：identityType=phone AND identifier=X AND 关联 account 未软删 */
        const active = await this.prisma.client.accountIdentity.findFirst({
            where: {
                identityType: 'phone',
                identifier: trimmedPhone,
                account: { deletedAt: null },
            },
        });
        if (active) {
            throw new ConflictException(identityConflictActiveMessage('phone', phone));
        }
        /** 预查撞已删除 */
        const deleted = await this.prisma.client.accountIdentity.findFirst({
            where: {
                identityType: 'phone',
                identifier: trimmedPhone,
                account: { deletedAt: { not: null } },
            },
        });
        if (deleted) {
            throw new ConflictException(identityConflictDeletedMessage('phone', phone));
        }

        return this.prisma.client.$transaction(async (tx) => {
            const account = await tx.account.create({
                data: { userType: 'member', enabled: true } as unknown as Prisma.AccountUncheckedCreateInput,
            });

            try {
                await tx.accountIdentity.create({
                    data: {
                        accountId: account.id,
                        identityType: 'phone',
                        identifier: trimmedPhone,
                        credential: null,
                        verified: true,
                    } as unknown as Prisma.AccountIdentityUncheckedCreateInput,
                });
            } catch (err) {
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                    /** 并发场景：重新做一次预查定位文案 */
                    const target = (err.meta as { target?: string[] })?.target;
                    if (Array.isArray(target) && (target.includes('identityType') || target.includes('identifier'))) {
                        throw new ConflictException(identityConflictActiveMessage('phone', phone));
                    }
                    throw new ConflictException('创建 C 端账户时发生唯一约束冲突');
                }
                throw err;
            }

            await tx.memberProfile.create({
                data: {
                    accountId: account.id,
                    phone,
                    nickname: nickname || `用户${phone.slice(-4)}`,
                } as unknown as Prisma.MemberProfileUncheckedCreateInput,
            });

            return account;
        });
    }

    /**
     * 更新最后登录信息
     */
    async updateLastLogin(accountId: string, ip: string) {
        // 直接更新 last login 信息
        await this.prisma.client.account.update({
            where: { id: accountId },
            data: {
                lastLoginAt: new Date(),
                lastLoginIp: ip,
            },
        });
    }

    /**
     * 更新账户身份的密码字段
     * - 用于重置密码 / 改密流程
     * - 仅更新 credential 字段，不动其他字段
     * @param identityId account_identity.id
     * @param hashedPassword bcrypt 哈希后的密码
     */
    async updateIdentityCredential(identityId: string, hashedPassword: string): Promise<void> {
        await this.prisma.client.accountIdentity.update({
            where: { id: identityId },
            data: { credential: hashedPassword },
        });
    }
}
