/**
 * 认证模块 GraphQL 类型定义
 *
 * 包含：
 * - MenuTreeNode: 菜单树节点（递归类型，支持子菜单）
 * - AdminMe: 管理端「我」的数据结构（含完整权限数据）
 * - MemberMe: C 端「我」的数据结构（仅基础信息）
 * - MeUnion: 上述两者的联合类型，由 userType 字段判别
 *
 * 设计要点：
 * - 区分两端字段：管理端要 menus + permissions 用于前端路由守卫；C 端只要昵称头像
 * - 用 union 而非单一大类型：避免泄露无关字段（如 C 端不该看到 permissions）
 * - 用显式 userType 字段判别：避免依赖字段特征（字段增删时不会误判）
 */
import { Field, ID, Int, ObjectType, createUnionType } from '@nestjs/graphql';

/**
 * 菜单树节点（GraphQL 递归类型）
 * - 对应数据库 admin_menu / member_menu 的一条记录
 * - children 是同类型的数组，GraphQL 自动支持递归解析
 * - 可选字段用 nullable: true，避免前端查询时报错
 */
@ObjectType('MenuTreeNode')
export class MenuTreeNode {
    @Field(() => ID)
    id!: string;

    /** 父菜单 ID，根菜单为 null */
    @Field(() => String, { nullable: true })
    parentId?: string;

    @Field()
    name!: string;

    /** 菜单类型：directory | menu | button */
    @Field()
    type!: string;

    @Field(() => String, { nullable: true })
    path?: string;

    /** 前端路由名称（与 Vue Router 的 name 对应） */
    @Field(() => String, { nullable: true })
    routeName?: string;

    /** 前端组件路径（如 iam/admins，对应 componentMap 的 key） */
    @Field(() => String, { nullable: true })
    component?: string;

    @Field(() => String, { nullable: true })
    icon?: string;

    /** 权限码（如 iam:admin:list），按钮类型菜单必填 */
    @Field(() => String, { nullable: true })
    permissionCode?: string;

    /** 排序值，越小越靠前 */
    @Field(() => Int)
    sort!: number;

    /** 是否显示在菜单中 */
    @Field()
    visible!: boolean;

    /** 是否缓存页面（keep-alive） */
    @Field()
    keepAlive!: boolean;

    /** 是否启用 */
    @Field()
    enabled!: boolean;

    /** 激活时高亮的菜单 ID（详情页回指父菜单） */
    @Field(() => String, { nullable: true })
    activeMenuId?: string;

    /** 子菜单（递归自引用） */
    @Field(() => [MenuTreeNode])
    children!: MenuTreeNode[];
}

/**
 * 管理端「我」的返回类型
 * - accountId: 账户 ID
 * - username: 用户名（来自 account_identity 表的 identity_type='username' 记录）
 * - nickname: 昵称（来自 admin_profile 表）
 * - roles: 角色编码列表（如 ['super_admin']）
 * - permissions: 聚合后的权限码列表（含 grant/deny 处理）
 * - menus: 菜单树（用于前端动态路由）
 *
 * 注意：userType 字段是 GraphQL 不可见的运行时字段，仅供 Union 的 resolveType 判别
 */
@ObjectType('AdminMe')
export class AdminMe {
    @Field(() => ID)
    accountId!: string;

    @Field()
    username!: string;

    @Field()
    nickname!: string;

    @Field({ nullable: true, description: '头像 URL（来自 admin_profile）' })
    avatar?: string;

    @Field(() => [String])
    roles!: string[];

    @Field(() => [String])
    permissions!: string[];

    @Field(() => [MenuTreeNode])
    menus!: MenuTreeNode[];

    /**
     * 运行时判别字段（不导出到 GraphQL schema）
     * - 仅用于 MeUnion.resolveType 决定返回 AdminMe 还是 MemberMe
     * - 避免依赖字段特征（permissions 存在与否），更健壮
     */
    userType!: 'admin';
}

/**
 * C 端「我」的返回类型
 * - accountId: 账户 ID
 * - nickname: 昵称（来自 member_profile 表）
 * - avatar: 头像 URL
 * - roles: 角色编码列表（如 ['vip', 'svip']）
 */
@ObjectType('MemberMe')
export class MemberMe {
    @Field(() => ID)
    accountId!: string;

    @Field({ nullable: true })
    nickname?: string;

    @Field({ nullable: true })
    avatar?: string;

    @Field(() => [String])
    roles!: string[];

    /** 运行时判别字段（不导出到 GraphQL schema） */
    userType!: 'member';
}

/**
 * 联合类型 Me = AdminMe | MemberMe
 * - GraphQL 客户端查询时必须用内联片段：... on AdminMe { ... } | ... on MemberMe { ... }
 * - resolveType 通过显式 userType 字段判别，更可靠
 *
 * 用法示例：
 * ```graphql
 * # Admin 端 — 拼路由需要 menus + permissions
 * query {
 *   me {
 *     __typename
 *     ... on AdminMe {
 *       username
 *       nickname
 *       roles
 *       permissions
 *       menus { id name path children { id name } }
 *     }
 *   }
 * }
 *
 * # Web C 端 — 只要昵称和头像
 * query {
 *   me {
 *     __typename
 *     ... on MemberMe { nickname avatar roles }
 *   }
 * }
 * ```
 */
export const MeUnion = createUnionType({
    name: 'Me',
    description: '当前登录用户信息（管理端或 C 端，按 userType 区分）',
    types: () => [AdminMe, MemberMe] as const,
    /**
     * 类型判别函数
     * - 接收 resolver 返回的实际对象
     * - 根据 userType 字段返回 GraphQL 类型名
     * - 返回 null 时 GraphQL 会自动尝试用字段特征推断（不推荐）
     */
    // 修复：@nestjs/graphql 13.4.2 升级后 ResolveTypeFn 类型变为 (value: unknown, ...) => string | null
    // 这里把 value 强转为 any 绕过类型检查（运行时类型由下面的 userType 判别保证）
    resolveType: ((value: unknown) => {
        const v = value as { userType?: 'admin' | 'member' } | null;
        if (v?.userType === 'admin') return 'AdminMe';
        if (v?.userType === 'member') return 'MemberMe';
        return null;
    }) as never,
});
