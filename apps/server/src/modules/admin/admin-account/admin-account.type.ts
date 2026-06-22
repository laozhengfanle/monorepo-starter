/**
 * 管理端账户 GraphQL ObjectType
 *
 * 字段设计：
 * - id: 账户 ID（UUID v7）
 * - username: 用户名（来自 account_identity）
 * - nickname: 昵称（来自 admin_profile）
 * - phone: 手机号（来自 admin_profile，可选）
 * - email: 邮箱（来自 admin_profile，可选）
 * - avatar: 头像 URL（来自 admin_profile，可选，空时前端用首字母占位）
 * - enabled: 账号启用状态
 * - roles: 角色码列表（如 ['super_admin', 'editor']）
 * - roleIds: 角色 ID 列表（用于前端做单角色回填 / 特例授权）
 * - deletedAt: 软删除时间（仅「显示已删除」视图下非空，活跃用户为 null）
 *   - 前端按 deletedAt 是否为 null 区分视觉
 * - createdAt/updatedAt: 时间戳
 *
 * 注意：
 * - password 字段不出现在查询结果（安全考虑）
 * - 一次返回多角色以支持「多角色绑定」场景；前端表格展示时取第一个作为代表
 */
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('AdminAccount', { description: '管理端账户' })
export class AdminAccount {
    @Field(() => ID)
    id!: string;

    @Field({ description: '用户名（登录标识）' })
    username!: string;

    @Field({ description: '昵称' })
    nickname!: string;

    @Field(() => String, { nullable: true, description: '手机号' })
    phone?: string;

    @Field(() => String, { nullable: true, description: '邮箱' })
    email?: string;

    @Field(() => String, { nullable: true, description: '头像 URL（空时前端用首字母占位）' })
    avatar?: string;

    @Field({ description: '账号是否启用' })
    enabled!: boolean;

    @Field(() => [String], { description: '角色码列表（如 super_admin）' })
    roles!: string[];

    @Field(() => [String], { nullable: true, description: '角色 ID 列表' })
    roleIds?: string[];

    /**
     * 软删除时间
     * - 活跃行：null
     * - 已软删：Date
     * - 仅在 list query 带 includeDeleted=true 时才可能非空
     */
    @Field(() => Date, {
        nullable: true,
        description: '软删除时间（null=活跃行；非空=已软删；仅在 includeDeleted=true 时可能非空）',
    })
    deletedAt?: Date | null;

    @Field({ description: '创建时间' })
    createdAt!: Date;

    @Field({ description: '更新时间' })
    updatedAt!: Date;

    /**
     * 账号是否处于登录失败锁定状态
     * - true: 5 次失败被锁，30 分钟内不能登录
     * - false: 正常或未触发锁定
     * - 通过 @ResolveField 实时查 Redis，列表场景下会 N+1（后续可用 DataLoader 优化）
     * - 前端表格用此字段决定是否展示「解锁」按钮
     */
    @Field({ description: '账号是否被登录失败计数锁定（true=被锁，30 分钟内不可登录）' })
    isLocked?: boolean;
}
