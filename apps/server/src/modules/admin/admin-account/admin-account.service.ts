/**
 * 管理端账户服务
 *
 * 业务能力：
 * - 列表查询（offset 分页 + keyword 模糊搜索 + enabled 筛选）
 * - 单条查询（含角色信息）
 * - 创建（事务：account + identity + profile + roles）
 * - 更新（profile + 角色重分配 + enabled 切换）
 * - 软删除（含最后一个超管保护）
 * - 硬删（hardDelete，事务清掉所有级联表）+ 恢复（restore）+ includeDeleted 列表
 * - 角色分配
 *
 * 缓存策略：
 * - 写操作后调用 AdminPermissionCacheService.invalidateAccount()
 * - 角色分配后调用 invalidateRole() 级联失效
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { Prisma } from '../../../../prisma/generated/client.js';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { PrismaTx } from '../../../common/prisma/prisma.js';
import { hashPassword } from '../../../common/utils/crypto.js';
import { AuditService, AUDIT_ACTIONS } from '../../audit/audit.service.js';
import { AdminPermissionCacheService } from '../admin-permission-cache.service.js';
import { SystemConfigService } from '../system-config/system-config.service.js';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service.js';
import type { AdminAccount } from './admin-account.type.js';
import type { PaginatedType } from '../../graphql/common/pagination.type.js';
import type { DataLoaders } from '../../../common/dataloader/index.js';

/**
 * 撞 unique 时的统一文案
 * - 用户名场景：「用户名 X 已被使用」
 * - 「X 已被使用（旧记录已删除，可在「显示已删除」视图下找到并彻底删除后重试）」
 */
function usernameConflictActiveMessage(username: string): string {
    return `用户名 ${username} 已被使用`;
}
function usernameConflictDeletedMessage(username: string): string {
    return `用户名 ${username} 已被使用（旧记录已删除，可在「显示已删除」视图下找到并彻底删除后重试）`;
}

/**
 * 生成满足复杂度要求的随机初始密码
 * - 12 字符，含大小写字母 + 数字 + 特殊字符
 * - 使用 crypto.randomBytes（密码学安全）
 * - Phase 8 应改为通过邮件/SMS 发送初始密码
 */
function generateInitialPassword(): string {
    const chars = {
        upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // 排除 I/O 避免混淆
        lower: 'abcdefghjkmnpqrstuvwxyz', // 排除 i/l/o 避免混淆
        digit: '23456789', // 排除 0/1 避免混淆
        special: '!@#$%^&*',
    };
    const all = Object.values(chars).join('');
    const bytes = randomBytes(12);
    // 确保每种字符至少出现一次
    const result: string[] = [
        chars.upper[bytes[0] % chars.upper.length],
        chars.lower[bytes[1] % chars.lower.length],
        chars.digit[bytes[2] % chars.digit.length],
        chars.special[bytes[3] % chars.special.length],
    ];
    // 剩余 8 位从全部字符中随机选取
    for (let i = 4; i < 12; i++) {
        result.push(all[bytes[i] % all.length]);
    }
    // Fisher-Yates shuffle
    for (let i = result.length - 1; i > 0; i--) {
        const j = bytes[i] % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result.join('');
}

@Injectable()
export class AdminAccountService {
    private readonly logger = new Logger(AdminAccountService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: AdminPermissionCacheService,
        private readonly auditService: AuditService,
        private readonly systemConfigService: SystemConfigService,
        private readonly tokenBlacklist: TokenBlacklistService,
    ) {}

    /**
     * 分页查询管理员账户
     * - 模糊搜索 username / nickname
     * - enabled 状态筛选
     * - 关联查询角色
     * - includeDeleted：是否包含已软删的账户（默认 false）
     */
    async findAll(query: {
        page: number;
        pageSize: number;
        keyword?: string;
        enabled?: boolean;
        includeDeleted?: boolean;
    }): Promise<PaginatedType<AdminAccount>> {
        const { page, pageSize, keyword, enabled, includeDeleted = false } = query;
        const skip = (page - 1) * pageSize;

        const where: Prisma.AdminProfileWhereInput = {
            ...(includeDeleted ? {} : { deletedAt: null }),
            ...(keyword
                ? {
                      OR: [
                          {
                              account: {
                                  identities: {
                                      some: {
                                          identityType: 'username',
                                          identifier: { contains: keyword, mode: 'insensitive' as const },
                                      },
                                  },
                              },
                          },
                          { nickname: { contains: keyword, mode: 'insensitive' as const } },
                      ],
                  }
                : {}),
            ...(enabled !== undefined ? { account: { enabled } } : {}),
        };

        /**
         * includeDeleted=true 时 rawClient.adminProfile.findMany / count 绕开软删除扩展
         * - rawClient.findMany 不会自动加 deleted_at: null 条件 → 查到包含已软删的
         * - 关键词搜索时仍要走软删扩展外的 account 关联（account 是独立的软删表）
         */
        const client = includeDeleted ? this.prisma.rawClient : this.prisma.client;
        const [total, profiles] = await Promise.all([
            client.adminProfile.count({ where }),
            client.adminProfile.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
                include: {
                    account: {
                        include: {
                            adminRoles: {
                                include: { role: { select: { code: true, enabled: true } } },
                            },
                            identities: {
                                where: { identityType: 'username' },
                                select: { identifier: true },
                            },
                        },
                    },
                },
            }),
        ]);

        const items: AdminAccount[] = profiles.map((p) => this.toAdminAccount(p));
        return { items, total, page, pageSize };
    }

    /**
     * 分页查询（DataLoader 增强版）
     * - 适用场景：管理后台账户列表 + 列表内每行要展示「权限码数量」之类信息
     * - 行为差异：拉账户列表（1 SQL） + 用 dataloader 批量查每行的权限码（1 SQL 而非 N SQL）
     * - 与 findAll 的区别：dataloader 版只统计权限码数量（permissionsCount），不返回具体码
     *   适用于列表页只展示统计、不展示具体码的场景（前端不需要再发起额外查询）
     *
     * @param dataloaders GraphQL context.dataloaders（必填，dataloader 路径的核心）
     * @param query 与 findAll 一致
     */
    async findAllWithDataLoader(
        dataloaders: DataLoaders,
        query: {
            page: number;
            pageSize: number;
            keyword?: string;
            enabled?: boolean;
            includeDeleted?: boolean;
        },
    ): Promise<PaginatedType<AdminAccount> & { permissionsCountByAccountId: Record<string, number> }> {
        // 1) 先用现有 findAll 拿账户列表
        const result = await this.findAll(query);
        // 2) 用 dataloader 批量查每行的权限码（1 条 SQL，N 个账户）
        // 注意：AdminAccount.id 才是 account.id（adminProfile 联表查询时）
        const accountIds = result.items.map((a) => a.id);
        // DataLoader.loadMany 返回 (T | Error)[]，需要 narrow
        const permissionLists = await dataloaders.permissionsByAccountId.loadMany(accountIds);
        // 3) 统计每个 account 的权限数量
        const permissionsCountByAccountId: Record<string, number> = {};
        accountIds.forEach((id, i) => {
            const perms = permissionLists[i];
            permissionsCountByAccountId[id] = Array.isArray(perms) ? perms.length : 0;
        });
        return { ...result, permissionsCountByAccountId };
    }

    /**
     * 单条查询（包含角色码列表）
     * - 支持通过 profile ID 或 account ID 查询
     * - 先尝试按 profile ID 查找，找不到再按 account ID 查找
     * - 不再过滤软删除状态（用于 hardDelete / restore 校验）
     */
    /** 构建 findById 的 include 查询（避免重复） */
    private readonly ADMIN_ACCOUNT_INCLUDE = {
        account: {
            include: {
                adminRoles: { include: { role: { select: { code: true, enabled: true } } } },
                identities: {
                    where: { identityType: 'username' as const },
                    select: { identifier: true },
                },
            },
        },
    } as const;

    async findById(id: string): Promise<AdminAccount> {
        /**
         * 用 rawClient 查找，可以查到已软删的账户
         * - 用于 findById / hardDelete / restore
         * - 注意：account.deletedAt 不再被自动加 deleted_at: null
         */
        let profile = await this.prisma.rawClient.adminProfile.findUnique({
            where: { id },
            include: this.ADMIN_ACCOUNT_INCLUDE,
        });

        /** 如果按 profile ID 找不到，尝试按 account ID 查找 */
        if (!profile) {
            profile = await this.prisma.rawClient.adminProfile.findFirst({
                where: { accountId: id },
                include: this.ADMIN_ACCOUNT_INCLUDE,
            });
        }

        if (!profile) {
            throw new NotFoundException('账户不存在');
        }
        return this.toAdminAccount(profile);
    }

    /**
     * 创建管理员账户（事务）
     *
     * 流程：
     * 1. 检查 username 唯一
     *    - 预查撞活跃（关联 account.deletedAt IS NULL）
     *    - 预查撞已删除（关联 account.deletedAt IS NOT NULL）
     *    - 撞活跃/撞已删除 → 抛 ConflictException
     * 2. 创建 account
     * 3. 创建 account_identity(username + 随机初始密码)
     * 4. 创建 admin_profile
     * 5. 分配角色（如有 roleIds）
     * 6. 失效账户认证缓存
     *
     * 密码策略：
     * - 随机生成 12 位密码（大小写字母 + 数字 + 特殊字符）
     * - 首次登录时前端应引导用户修改密码（通过 adminLogin 返回的 mustChangePassword 标志判断）
     * - Phase 8 可改为邮件发送初始密码
     */
    async create(input: {
        username: string;
        nickname: string;
        phone?: string;
        email?: string;
        roleIds?: string[];
        avatar?: string;
        /**
         * 自定义初始密码（可选）
         * - 传了：用此密码（已由 Zod 校验 8-64 位 + 字母 + 数字）
         * - 不传：走 generateInitialPassword() 生成随机 8 位密码
         * 注意：这里不是必填，但前端调用时（参见 AdminsPage 的 onSubmit）必传，
         *   因为前端已经把"必填"下沉到 UI 层（避免后端随机密码不可见的问题）
         */
        password?: string;
    }): Promise<AdminAccount> {
        const lowerUsername = input.username.trim().toLowerCase();
        /**
         * 1. 预查撞活跃：identityType=username AND identifier=X AND 关联 account 未软删
         *    - 注意：accountIdentity 表本身不在 SOFT_DELETE_MODELS，软删除拦截器只作用在 account
         *    - 这里 rawClient.account.findFirst 绕过 account 的软删除拦截，
         *      然后我们手动加 deletedAt: null 条件去判断"撞活跃"
         */
        const activeIdentity = await this.prisma.client.accountIdentity.findFirst({
            where: {
                identityType: 'username',
                identifier: lowerUsername,
                account: { deletedAt: null },
            },
        });
        if (activeIdentity) {
            throw new ConflictException(usernameConflictActiveMessage(input.username));
        }
        /**
         * 2. 预查撞已删除：identityType=username AND identifier=X AND 关联 account 已软删
         *    - rawClient.account 绕开软删除拦截，deletedAt: { not: null } 显式查已软删
         */
        const deletedIdentity = await this.prisma.client.accountIdentity.findFirst({
            where: {
                identityType: 'username',
                identifier: lowerUsername,
                account: { deletedAt: { not: null } },
            },
        });
        if (deletedIdentity) {
            throw new ConflictException(usernameConflictDeletedMessage(input.username));
        }

        /**
         * 3. 决定初始密码
         *    - 入参带 password：使用入参的明文（已经过 Zod 强度校验）
         *    - 入参不带 password：后端随机生成 8 位（generateInitialPassword 返回类型为 string）
         *    - 注意：返回响应里也带 initialPassword 字段（create 结尾处），让前端能展示给 admin
         *      （密码只此一次明文出现，入库后只剩哈希值）
         */
        const initialPassword = input.password ?? generateInitialPassword();

        /** 动态密码策略校验：从 system_config 读取 passwordMinLength / passwordComplexity */
        await this.validatePasswordPolicy(initialPassword);
        const hashedPassword = await hashPassword(initialPassword);

        const { accountId, profileId } = await this.prisma.client.$transaction(async (tx) => {
            /** 创建账户 */
            const account = await tx.account.create({
                data: { userType: 'admin', enabled: true } as unknown as Prisma.AccountUncheckedCreateInput,
            });

            /**
             * 创建登录标识
             * - 包 try/catch 处理 P2002：并发场景下两个请求同时预查后都通过，但创建时撞 unique
             */
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
                    /** 并发场景：另一个请求在我们预查后抢先创建。重新走预查逻辑定位文案 */
                    const target = (err.meta as { target?: string[] })?.target;
                    if (Array.isArray(target) && (target.includes('identityType') || target.includes('identifier'))) {
                        const activeNow = await tx.accountIdentity.findFirst({
                            where: {
                                identityType: 'username',
                                identifier: lowerUsername,
                                account: { deletedAt: null },
                            },
                        });
                        if (activeNow) {
                            throw new ConflictException(usernameConflictActiveMessage(input.username));
                        }
                        const deletedNow = await tx.accountIdentity.findFirst({
                            where: {
                                identityType: 'username',
                                identifier: lowerUsername,
                                account: { deletedAt: { not: null } },
                            },
                        });
                        if (deletedNow) {
                            throw new ConflictException(usernameConflictDeletedMessage(input.username));
                        }
                    }
                    throw new ConflictException('创建账户时发生唯一约束冲突');
                }
                throw err;
            }

            /** 创建管理员档案 */
            const profile = await tx.adminProfile.create({
                data: {
                    accountId: account.id,
                    nickname: input.nickname,
                    phone: input.phone || '',
                    email: input.email || '',
                    // avatar：空字符串统一存为 ''（与 DB 默认值一致），让「无头像」语义明确
                    avatar: input.avatar || '',
                } as unknown as Prisma.AdminProfileUncheckedCreateInput,
            });

            /** 分配角色 */
            if (input.roleIds && input.roleIds.length > 0) {
                await tx.adminAccountRole.createMany({
                    data: input.roleIds.map((roleId: string) => ({
                        accountId: account.id,
                        roleId,
                    })) as unknown as Prisma.AdminAccountRoleCreateManyInput[],
                    skipDuplicates: true,
                });
            }

            return { accountId: account.id, profileId: profile.id };
        });

        /** 失效账户缓存（新建账户首次登录会构建缓存，这里提前失效避免读到旧数据） */
        await this.cacheService.invalidateAccount(accountId);

        /**
         * 写审计日志（失败不影响主流程）
         * 使用细粒度 action（ACCOUNT_CREATED）而非粗粒度 CREATED：
         * - 审计场景要能区分"创建账号"vs"创建角色"vs"创建菜单"
         * - 配合 detail 字段记录 username/roleIds，可还原完整操作链
         */
        await this.auditService.record({
            accountId,
            action: AUDIT_ACTIONS.ACCOUNT_CREATED,
            resourceType: 'admin_account',
            resourceId: profileId,
            detail: { username: input.username, roleIds: input.roleIds ?? [] },
        });

        return this.findById(accountId);
    }

    /**
     * 更新管理员账户
     * - 可更新 profile 字段 + 角色列表
     * - 不允许通过此接口修改 username（username 唯一且关联 identity）
     *
     * 安全：超管保护检查和操作在同一事务中，防并发竞态
     */
    async update(
        id: string,
        input: {
            nickname?: string;
            phone?: string;
            email?: string;
            enabled?: boolean;
            roleIds?: string[];
            /**
             * 头像 URL：
             * - undefined：不更新（partial 语义）
             * - ''：清空（与 GraphQL UpdateAdminAccountInput.avatar 描述一致）
             * - 'http://...' / '/uploads/...'：替换
             */
            avatar?: string;
        },
    ): Promise<AdminAccount> {
        // 检查存在（id 可能是 accountId，对齐 findById 的 fallback 逻辑）
        // 使用 rawClient.findUnique/findFirst：绕过软删除拦截（可查已软删的记录）
        let profile = await this.prisma.rawClient.adminProfile.findUnique({ where: { id } });
        if (!profile) {
            profile = await this.prisma.rawClient.adminProfile.findFirst({ where: { accountId: id } });
        }
        if (!profile) {
            throw new NotFoundException('账户不存在');
        }

        const existing = profile;
        const accountId = existing.accountId;

        /**
         * 所有操作在同一个事务中执行，防止并发竞态
         * - 超管检查 + 禁用/角色变更在同一事务中
         * - 与 removeRoleFromAccount 的模式一致
         */
        await this.prisma.client.$transaction(async (tx) => {
            /** 更新 profile（如果传了字段）
             *  注意：avatar 显式用 `!== undefined` 判断，保留 partial 语义
             *  - undefined → 不更新（前端编辑表单不传）
             *  - '' → 写入空字符串（前端显式清空头像）
             *  - 'url' → 写入新 URL（前端上传后回调）
             */
            const profileUpdate: Record<string, unknown> = {};
            if (input.nickname !== undefined) profileUpdate.nickname = input.nickname;
            if (input.phone !== undefined) profileUpdate.phone = input.phone;
            if (input.email !== undefined) profileUpdate.email = input.email;
            if (input.avatar !== undefined) profileUpdate.avatar = input.avatar;
            if (Object.keys(profileUpdate).length > 0) {
                await tx.adminProfile.update({ where: { id: existing.id }, data: profileUpdate });
            }

            /** 更新 account.enabled（含超管保护，在事务内检查） */
            if (input.enabled === false) {
                const isSuperAdmin = await this.hasSuperAdminRoleInTx(tx, accountId);
                if (isSuperAdmin) {
                    const activeCount = await this.activeSuperAdminCount(tx);
                    if (activeCount <= 1) {
                        throw new ForbiddenException('至少保留一个可用的超级管理员账户');
                    }
                }
                await tx.account.update({ where: { id: accountId }, data: { enabled: input.enabled } });
            } else if (input.enabled !== undefined) {
                await tx.account.update({ where: { id: accountId }, data: { enabled: input.enabled } });
            }

            /** 重新分配角色（如有 roleIds 字段，含超管保护在事务内检查） */
            if (input.roleIds !== undefined) {
                const removedSuperAdmin = await this.checkRemovingSuperAdmin(tx, accountId, input.roleIds);
                if (removedSuperAdmin) {
                    const activeCount = await this.activeSuperAdminCount(tx);
                    if (activeCount <= 1) {
                        throw new ForbiddenException('至少保留一个可用的超级管理员账户');
                    }
                }

                await tx.adminAccountRole.deleteMany({ where: { accountId } });
                if (input.roleIds.length > 0) {
                    await tx.adminAccountRole.createMany({
                        data: input.roleIds.map((roleId: string) => ({
                            accountId,
                            roleId,
                        })) as unknown as Prisma.AdminAccountRoleCreateManyInput[],
                        skipDuplicates: true,
                    });
                }
            }
        });

        /** 失效账户缓存（角色变更会影响权限码 + 菜单） */
        await this.cacheService.invalidateAccount(accountId);

        /**
         * 写审计日志
         * 使用细粒度 ACCOUNT_UPDATED：包含 profile 字段、enabled 切换、角色重分配三种变更
         * 为什么不细分到 enabled/role_updated：当前 update() 是统一接口，一次调用可能改多项
         * detail.changes 字段记录了具体变更内容，需要时可以进一步过滤
         *
         * 个人信息脱敏（L8 修复）：
         * - phone: 138****1234（中间 4 位用 * 替换）
         * - email: a***@example.com（用户名部分除首字符外用 * 替换）
         * - nickname / avatar: 不脱敏（非敏感信息，avatar 是公开 URL）
         * - 目的：审计日志可能被多人查看，个人信息需脱敏存储
         */
        await this.auditService.record({
            accountId,
            action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
            resourceType: 'admin_account',
            resourceId: id,
            detail: { changes: this.maskSensitiveFields(input) },
        });

        return this.findById(id);
    }

    /**
     * 软删除管理员账户
     * - 超管保护检查和删除在同一事务中，防并发竞态
     */
    async delete(id: string): Promise<{ id: string; deleted: true }> {
        let profile = await this.prisma.rawClient.adminProfile.findUnique({ where: { id } });
        if (!profile) {
            profile = await this.prisma.rawClient.adminProfile.findFirst({ where: { accountId: id } });
        }
        if (!profile) {
            throw new NotFoundException('账户不存在');
        }
        const existing = profile;
        const accountId = existing.accountId;

        /** 超管保护 + 软删除在同一事务中 */
        await this.prisma.client.$transaction(async (tx) => {
            const isSuperAdmin = await this.hasSuperAdminRoleInTx(tx, accountId);
            if (isSuperAdmin) {
                const activeCount = await this.activeSuperAdminCount(tx);
                if (activeCount <= 1) {
                    throw new ForbiddenException('至少保留一个可用的超级管理员账户');
                }
            }
            await tx.adminProfile.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
            await tx.account.update({ where: { id: accountId }, data: { deletedAt: new Date() } });
        });

        /** 失效账户缓存 */
        await this.cacheService.invalidateAccount(accountId);

        /**
         * 撤销该账号所有 token
         * - 后置清理：账号已软删，撤销失败不阻塞主流程
         */
        this.tokenBlacklist.revokeAccountTokens(accountId, 'account_deleted').catch((err) => {
            this.logger.error(`softDelete 后置撤销 token 失败: accountId=${accountId} err=${(err as Error).message}`);
        });

        /**
         * 写审计日志
         * 使用细粒度 ACCOUNT_DELETED：审计场景要能精确回答"谁被软删了"
         * 比通用的 user_deleted 更明确（明确是"账号"被删，而非 profile 或其他资源）
         */
        await this.auditService.record({
            accountId,
            action: AUDIT_ACTIONS.ACCOUNT_DELETED,
            resourceType: 'admin_account',
            resourceId: id,
        });

        return { id, deleted: true };
    }

    /**
     * 彻底删除管理员账户（硬删）
     * - 前置校验：行存在 + adminProfile.deletedAt IS NOT NULL
     * - 实际删除：事务内清掉所有级联表行（外键 onDelete: Restrict）
     *   - adminAccountMenu、adminAccountRole、adminProfile、accountIdentity、account
     * - 写审计日志：action = 'account_hard_deleted'
     *
     * 注意：必须用 rawClient 而不是 client，因为软删除扩展会把 delete 改写成 set deletedAt
     */
    async hardDelete(id: string, operatorId?: string): Promise<{ id: string; deleted: true }> {
        /** 1. 校验行存在（绕过软删除拦截以查到已软删的记录） */
        let profile = await this.prisma.rawClient.adminProfile.findUnique({ where: { id } });
        if (!profile) {
            profile = await this.prisma.rawClient.adminProfile.findFirst({ where: { accountId: id } });
        }
        if (!profile) {
            throw new NotFoundException('账户不存在');
        }
        const accountId = profile.accountId;

        /** 2. 仅允许彻底删除已软删的记录 */
        if (profile.deletedAt === null) {
            throw new BadRequestException('仅允许彻底删除已软删的记录');
        }

        /**
         * 3. 物理删除所有级联表行（事务）
         * - 走 rawClient.$transaction：绕过软删除扩展，让 tx.account.delete 真正物理删除行
         *   - 软删除扩展会让 tx.account.delete 改写成 set deletedAt = now()，与 hardDelete 语义相悖
         * - delete 顺序：先删子表，再删父表（外键 onDelete: Restrict 反向要求）
         * - 子表：adminAccountMenu（账号 → 菜单覆盖）、adminAccountRole（账号 → 角色）
         * - 断开外键：auditLog（accountId → NULL，保留审计记录）、uploadFile（直接删除文件记录）
         * - 父表：adminProfile、accountIdentity、account
         */
        const deletedUsername = await this.prisma.rawClient.$transaction(async (tx) => {
            // 取一下 username 留作审计快照（删除后无法再查）
            const identity = await tx.accountIdentity.findFirst({
                where: { accountId, identityType: 'username' },
                select: { identifier: true },
            });
            await tx.adminAccountMenu.deleteMany({ where: { accountId } });
            await tx.adminAccountRole.deleteMany({ where: { accountId } });
            await tx.adminProfile.delete({ where: { id: profile.id } });
            await tx.accountIdentity.deleteMany({ where: { accountId } });
            /**
             * 断开审计日志的外键关联（accountId → NULL）
             * - 审计日志应永久保留，不能随账户一起删除
             * - 将 accountId 置 NULL 后，该账户的历史操作记录仍可追溯（通过 detail 字段）
             */
            await tx.auditLog.updateMany({ where: { accountId }, data: { accountId: null } });
            /**
             * 删除该账户上传的文件记录
             * - 文件元数据与账户强绑定，账户彻底删除后文件记录也应清除
             * - 实际文件存储的清理可由定时任务异步处理
             */
            await tx.uploadFile.deleteMany({ where: { accountId } });
            await tx.account.delete({ where: { id: accountId } });
            return identity?.identifier;
        });

        /** 4. 失效账户缓存（缓存里可能还残留着该账户的认证信息） */
        await this.cacheService.invalidateAccount(accountId);

        /**
         * 写审计日志：action = 'account_hard_deleted'
         * - resourceType 仍为 'admin_account'，用 action 区分软删 vs 硬删
         * - 配合 detail.username 记录被硬删的 username（删除后无法再查，username 必须保留快照）
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ACCOUNT_HARD_DELETED,
            resourceType: 'admin_account',
            resourceId: id,
            detail: { username: deletedUsername, accountId },
        });

        return { id, deleted: true };
    }

    /**
     * 恢复已软删除的管理员账户
     * - 前置校验：行存在 + adminProfile.deletedAt IS NOT NULL
     * - 唯一冲突预查：当前活跃账户里是否有同 username 的 accountIdentity
     * - 实际恢复：事务内把 adminProfile 和 account 的 deletedAt 置 NULL
     * - 写审计日志：action = 'account_restored'
     */
    async restore(id: string, operatorId?: string): Promise<{ id: string; deleted: false; restored: true }> {
        /** 1. 校验行存在 */
        let profile = await this.prisma.rawClient.adminProfile.findUnique({ where: { id } });
        if (!profile) {
            profile = await this.prisma.rawClient.adminProfile.findFirst({ where: { accountId: id } });
        }
        if (!profile) {
            throw new NotFoundException('账户不存在');
        }
        const accountId = profile.accountId;
        /** 2. 仅允许恢复已软删的记录 */
        if (profile.deletedAt === null) {
            throw new BadRequestException('仅允许恢复已软删的记录');
        }

        /**
         * 3. unique 冲突预查：当前活跃账户里是否有同 username 的 accountIdentity
         *    - 排除自身 accountId
         *    - AccountIdentity 不在 SOFT_DELETE_MODELS，findFirst 不需要绕开软删除
         *    - 用关联 account.deletedAt = null 来过滤"撞活跃"
         */
        const identity = await this.prisma.client.accountIdentity.findFirst({
            where: { accountId, identityType: 'username' },
        });
        if (identity) {
            const conflict = await this.prisma.client.accountIdentity.findFirst({
                where: {
                    identityType: 'username',
                    identifier: identity.identifier,
                    account: { deletedAt: null, NOT: { id: accountId } },
                },
            });
            if (conflict) {
                throw new ConflictException(`用户名 ${identity.identifier} 已被其他记录占用，无法恢复`);
            }
        }

        /** 4. 实际恢复（事务内把 profile 和 account 的 deletedAt 置 NULL） */
        await this.prisma.client.$transaction(async (tx) => {
            await tx.adminProfile.update({ where: { id: profile.id }, data: { deletedAt: null } });
            await tx.account.update({ where: { id: accountId }, data: { deletedAt: null } });
        });

        /** 失效账户缓存 */
        await this.cacheService.invalidateAccount(accountId);

        /** 写审计日志：action = 'account_restored' */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ACCOUNT_RESTORED,
            resourceType: 'admin_account',
            resourceId: id,
            detail: { accountId },
        });

        return { id, deleted: false, restored: true };
    }

    /**
     * 分配角色（仅角色变更，不改 profile）
     * - 超管保护检查和角色变更在同一事务中，防并发竞态
     */
    async assignRoles(accountId: string, roleIds: string[]): Promise<AdminAccount> {
        /** 超管保护 + 角色变更在同一事务中 */
        await this.prisma.client.$transaction(async (tx) => {
            const removedSuperAdmin = await this.checkRemovingSuperAdmin(tx, accountId, roleIds);
            if (removedSuperAdmin) {
                const activeCount = await this.activeSuperAdminCount(tx);
                if (activeCount <= 1) {
                    throw new ForbiddenException('至少保留一个可用的超级管理员账户');
                }
            }

            await tx.adminAccountRole.deleteMany({ where: { accountId } });
            if (roleIds.length > 0) {
                await tx.adminAccountRole.createMany({
                    data: roleIds.map((roleId: string) => ({
                        accountId,
                        roleId,
                    })) as unknown as Prisma.AdminAccountRoleCreateManyInput[],
                    skipDuplicates: true,
                });
            }
        });

        /** 失效账户缓存 */
        await this.cacheService.invalidateAccount(accountId);

        /**
         * 写审计日志
         * 使用细粒度 ROLE_ASSIGNED：审计要能回答"谁给谁分配了什么角色"
         * detail.roleIds 记录分配的目标角色 ID 列表
         * 注意：assignRoles() 是 replace 语义（先删后插），所以统一记为"assigned"
         * 如需区分"新增"vs"撤销"，需后续在调用方拆分接口
         */
        await this.auditService.record({
            accountId,
            action: AUDIT_ACTIONS.ROLE_ASSIGNED,
            resourceType: 'admin_account',
            resourceId: accountId,
            detail: { roleIds },
        });

        return this.findById(accountId);
    }

    /**
     * 重置管理员密码（admin→admin 强制改密，不要求旧密码）
     *
     * 流程：
     * 1. 校验账户存在 + 未软删
     * 2. 校验 accountIdentity(identityType='username') 存在（没找到说明账户没启用用户名登录）
     * 3. 哈希新密码 → 更新 accountIdentity.credential
     * 4. 失效账户认证缓存（让用户下次请求被迫重新走密码校验）
     * 5. 写审计日志：action = 'reset_password'
     *
     * 不做的事：
     * - 不强制踢所有 session（旧 accessToken 仍能用 15min），避免改密带来大范围业务中断
     *   若后续要"改密即踢出"，新增一个 redis 黑名单或 refresh-token 失效机制即可
     * - 不检查操作者自己是否持有 super_admin：已经由 resolver 的 @Permission('iam:admin:update') 限定
     *
     * @param id 目标账户 ID
     * @param newPassword 新明文密码（已通过 ResetAdminPasswordSchema 验证）
     * @param operatorId 操作者账户 ID（用于审计）
     */
    async resetPassword(id: string, newPassword: string, operatorId?: string): Promise<{ id: string; reset: true }> {
        /** 1. 校验账户存在（rawClient 软删除扩展按 deletedAt=null 过滤，避开） */
        const account = await this.prisma.rawClient.account.findUnique({ where: { id } });
        if (!account || account.deletedAt !== null) {
            throw new NotFoundException('账户不存在');
        }

        /** 2. 校验 username identity 存在（重置密码得有可写入的 credential 行） */
        const identity = await this.prisma.client.accountIdentity.findFirst({
            where: { accountId: id, identityType: 'username' },
        });
        if (!identity) {
            throw new BadRequestException('该账户未启用用户名登录，无法重置密码');
        }

        /** 3. 哈希新密码并更新（不更新 identifier / identityType，credential 才是密码字段） */
        /** 动态密码策略校验：从 system_config 读取 passwordMinLength / passwordComplexity */
        await this.validatePasswordPolicy(newPassword);
        const hashed = await hashPassword(newPassword);
        await this.prisma.client.accountIdentity.update({
            where: { id: identity.id },
            data: { credential: hashed },
        });

        /**
         * 4. 失效账户认证缓存
         * 关键：缓存里保存的是 "已校验通过" 的状态，不失效用户改完密码后还能用旧 token
         * 注意 invalidateAccount 只会清掉此账户的权限/角色/菜单缓存，登录态本身由 JWT 维护（无需清）
         */
        await this.cacheService.invalidateAccount(id);

        /**
         * 撤销该账号所有 token
         * - 后置清理：密码已重置，撤销失败不阻塞主流程
         */
        this.tokenBlacklist.revokeAccountTokens(id, 'password_reset').catch((err) => {
            this.logger.error(`admin resetPassword 后置撤销 token 失败: id=${id} err=${(err as Error).message}`);
        });

        /**
         * 5. 写审计日志
         * - action: 'reset_password'（不是 PASSWORD_CHANGED，PASSWORD_CHANGED 是用户自己改自己）
         * - detail 不写明文密码！只记"由谁重置了谁的密码"
         * - 同时记 targetUsername 快照，方便审计查询"X 在 Y 时间重置了 Z 的密码"
         *   不用 join accountIdentity 表（资源 ID 已是 account UUID）
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.RESET_PASSWORD,
            resourceType: 'admin_account',
            resourceId: id,
            detail: {
                by: operatorId || 'system',
                targetUsername: identity.identifier,
            },
        });

        return { id, reset: true };
    }

    /**
     * 检查账户是否持有 super_admin 角色
     */
    private async hasSuperAdminRole(accountId: string): Promise<boolean> {
        const count = await this.prisma.client.adminAccountRole.count({
            where: {
                accountId,
                role: { code: 'super_admin', enabled: true },
            },
        });
        return count > 0;
    }

    /**
     * 事务内检查账户是否持有 super_admin 角色
     * - 用于在事务中避免并发竞态
     */
    private async hasSuperAdminRoleInTx(tx: PrismaTx, accountId: string): Promise<boolean> {
        const count = await tx.adminAccountRole.count({
            where: {
                accountId,
                role: { code: 'super_admin', enabled: true },
            },
        });
        return count > 0;
    }

    /**
     * 检查移除超管角色后是否还剩超管
     * - 如果新 roleIds 中不含 super_admin，且账户原本有 super_admin，则视为移除
     */
    private async checkRemovingSuperAdmin(client: PrismaTx, accountId: string, newRoleIds: string[]): Promise<boolean> {
        const superAdminRole = await client.adminRole.findFirst({
            where: { code: 'super_admin' },
            select: { id: true },
        });
        if (!superAdminRole) return false;
        if (newRoleIds.includes(superAdminRole.id)) return false;
        // 新角色列表不含 super_admin
        const existing = await client.adminAccountRole.count({
            where: { accountId, roleId: superAdminRole.id },
        });
        return existing > 0;
    }

    /**
     * 查询活跃超管数量（启用 + 未软删）
     */
    private async activeSuperAdminCount(client?: PrismaTx): Promise<number> {
        const c = client || this.prisma.client;
        return c.adminAccountRole.count({
            where: {
                role: { code: 'super_admin', enabled: true },
                account: { enabled: true, deletedAt: null },
            },
        });
    }

    /**
     * 将 Prisma 返回的 profile 转换为 GraphQL AdminAccount
     */
    private toAdminAccount(profile: {
        id: string;
        nickname: string;
        phone: string;
        email: string;
        avatar: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        account: {
            id: string;
            enabled: boolean;
            adminRoles: Array<{ roleId: string; role: { code: string } | null }>;
            identities: Array<{ identifier: string }>;
        } | null;
    }): AdminAccount {
        const account = profile.account ?? { id: '', enabled: false, adminRoles: [], identities: [] };
        const identity = account.identities?.[0] ?? { identifier: '' };
        const adminRoles = account.adminRoles ?? [];
        const roles: string[] = adminRoles
            .map((ar: { role: { code: string } | null }) => ar.role?.code)
            .filter((code: string | undefined): code is string => Boolean(code));
        const roleIds: string[] = adminRoles
            .map((ar: { roleId: string }) => ar.roleId)
            .filter((id: string | undefined): id is string => Boolean(id));

        return {
            id: account.id,
            username: identity.identifier ?? '',
            nickname: profile.nickname,
            phone: profile.phone || undefined,
            email: profile.email || undefined,
            avatar: profile.avatar || undefined,
            enabled: Boolean(account.enabled),
            roles,
            roleIds,
            /**
             * 软删除时间：从 profile 取
             * - 活跃行：null
             * - 已软删：Date
             * - 仅在 list query 带 includeDeleted=true 时才可能非空
             */
            deletedAt: profile.deletedAt ?? null,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        };
    }

    /**
     * 动态密码策略校验
     *
     * 从 system_config 读取 passwordMinLength 和 passwordComplexity，
     * 对密码做基于 DB 配置的二次校验（Zod schema 是静态兜底，DB 配置可实时调整）。
     *
     * 校验规则：
     * - passwordMinLength：密码最小长度（DB 配置，默认 8）
     * - passwordComplexity：
     *   - 'low'：仅长度要求
     *   - 'medium'：必须包含字母和数字
     *   - 'high'：必须包含大小写字母、数字和特殊字符
     *
     * 读取失败时回退到默认值（不阻塞主流程）
     */
    private async validatePasswordPolicy(password: string): Promise<void> {
        let minLength = 8;
        let complexity: 'low' | 'medium' | 'high' = 'medium';

        try {
            const config = await this.systemConfigService.findByKey('settings');
            const value = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
            if (typeof value?.passwordMinLength === 'number' && value.passwordMinLength > 0) {
                minLength = value.passwordMinLength;
            }
            if (['low', 'medium', 'high'].includes(value?.passwordComplexity as string)) {
                complexity = value.passwordComplexity as 'low' | 'medium' | 'high';
            }
        } catch {
            // 配置不存在或缓存异常 → 使用默认值
        }

        // 校验最小长度
        if (password.length < minLength) {
            throw new BadRequestException(`密码至少 ${minLength} 位（当前 ${password.length} 位）`);
        }

        // 校验复杂度
        if (complexity === 'medium') {
            if (!/[a-zA-Z]/.test(password)) {
                throw new BadRequestException('密码必须包含字母（当前策略：中等复杂度，需包含字母和数字）');
            }
            if (!/\d/.test(password)) {
                throw new BadRequestException('密码必须包含数字（当前策略：中等复杂度，需包含字母和数字）');
            }
        } else if (complexity === 'high') {
            if (!/[a-z]/.test(password)) {
                throw new BadRequestException(
                    '密码必须包含小写字母（当前策略：高复杂度，需包含大小写字母、数字和特殊字符）',
                );
            }
            if (!/[A-Z]/.test(password)) {
                throw new BadRequestException(
                    '密码必须包含大写字母（当前策略：高复杂度，需包含大小写字母、数字和特殊字符）',
                );
            }
            if (!/\d/.test(password)) {
                throw new BadRequestException(
                    '密码必须包含数字（当前策略：高复杂度，需包含大小写字母、数字和特殊字符）',
                );
            }
            if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
                throw new BadRequestException(
                    '密码必须包含特殊字符，如 !@#$%^&*（当前策略：高复杂度，需包含大小写字母、数字和特殊字符）',
                );
            }
        }
        // complexity === 'low'：仅长度要求，已通过上面的 minLength 校验
    }

    /**
     * 脱敏审计日志中的个人信息（L8 修复）
     *
     * 审计日志可能被多人查看（拥有 config:audit:list 权限的管理员），
     * 个人信息（手机号、邮箱）需脱敏后存储，遵循最小化原则。
     *
     * 脱敏规则：
     * - phone: 138****1234（保留前 3 后 4，中间用 * 替换）
     * - email: a***@example.com（用户名部分除首字符外用 * 替换，域名保留）
     * - nickname / avatar / enabled / roleIds: 不脱敏（非敏感信息）
     *
     * @param input 原始更新输入
     * @returns 脱敏后的输入（深拷贝，不修改原对象）
     */
    private maskSensitiveFields(input: {
        nickname?: string;
        phone?: string;
        email?: string;
        enabled?: boolean;
        roleIds?: string[];
        avatar?: string;
    }): Record<string, unknown> {
        const masked: Record<string, unknown> = {};

        /** nickname 直接复制（非敏感） */
        if (input.nickname !== undefined) masked.nickname = input.nickname;

        /** phone 脱敏：138****1234 */
        if (input.phone !== undefined) {
            masked.phone = this.maskPhone(input.phone);
        }

        /** email 脱敏：a***@example.com */
        if (input.email !== undefined) {
            masked.email = this.maskEmail(input.email);
        }

        /** avatar 直接复制（公开 URL） */
        if (input.avatar !== undefined) masked.avatar = input.avatar;

        /** enabled 直接复制（布尔值） */
        if (input.enabled !== undefined) masked.enabled = input.enabled;

        /** roleIds 直接复制（角色 ID，非个人信息） */
        if (input.roleIds !== undefined) masked.roleIds = input.roleIds;

        return masked;
    }

    /**
     * 手机号脱敏：138****1234
     * - 11 位手机号：保留前 3 后 4，中间 4 位用 * 替换
     * - 非 11 位：保留首尾各 1 位，中间用 * 替换
     * - 空字符串：原样返回
     */
    private maskPhone(phone: string): string {
        if (!phone) return phone;
        if (phone.length === 11) {
            return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
        }
        /** 非标准长度手机号：保留首尾各 1 位 */
        if (phone.length <= 2) return '*'.repeat(phone.length);
        return `${phone[0]}${'*'.repeat(phone.length - 2)}${phone.slice(-1)}`;
    }

    /**
     * 邮箱脱敏：a***@example.com
     * - 用户名部分：保留首字符，其余用 * 替换
     * - 域名部分：完整保留
     * - 无 @ 的字符串：整体保留首字符 + * 替换
     */
    private maskEmail(email: string): string {
        if (!email) return email;
        const atIdx = email.indexOf('@');
        if (atIdx <= 0) {
            /** 无 @ 或 @ 在首位：整体脱敏 */
            if (email.length <= 1) return '*';
            return `${email[0]}${'*'.repeat(email.length - 1)}`;
        }
        const username = email.slice(0, atIdx);
        const domain = email.slice(atIdx); // 含 @
        /** 用户名保留首字符，其余用 * 替换 */
        const maskedUsername = username.length <= 1 ? username : `${username[0]}${'*'.repeat(username.length - 1)}`;
        return `${maskedUsername}${domain}`;
    }
}
