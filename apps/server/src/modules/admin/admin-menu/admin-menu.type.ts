/**
 * 管理端菜单 GraphQL ObjectType
 *
 * 字段设计：
 * - id: 菜单 ID
 * - parentId: 父菜单 ID（根菜单为 null）
 * - name: 菜单名称
 * - type: 菜单类型（directory / menu / button）
 * - path: 路由路径
 * - routeName: 前端路由名称
 * - icon: 图标标识
 * - permissionCode: 权限码
 * - sort: 排序值
 * - visible: 是否显示
 * - keepAlive: 是否缓存
 * - enabled: 是否启用
 * - createdAt/updatedAt: 时间戳
 */
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AdminMenu', { description: '管理端菜单' })
export class AdminMenu {
    @Field(() => ID)
    id!: string;

    @Field(() => ID, { nullable: true, description: '父菜单 ID' })
    parentId?: string;

    @Field()
    name!: string;

    /** 菜单类型：directory | menu | button */
    @Field()
    type!: string;

    @Field(() => String, { nullable: true })
    path?: string;

    @Field(() => String, { nullable: true })
    routeName?: string;

    /** 前端组件名称（用于动态路由 componentMap 映射） */
    @Field(() => String, { nullable: true })
    component?: string;

    @Field(() => String, { nullable: true, description: '详情页高亮目标菜单 ID' })
    activeMenuId?: string;

    @Field(() => String, { nullable: true })
    icon?: string;

    @Field(() => String, { nullable: true })
    permissionCode?: string;

    @Field(() => Int)
    sort!: number;

    @Field()
    visible!: boolean;

    @Field()
    keepAlive!: boolean;

    @Field()
    enabled!: boolean;

    @Field({ description: '创建时间' })
    createdAt!: Date;

    @Field({ description: '更新时间' })
    updatedAt!: Date;
}

/**
 * 菜单树节点（递归子类型）
 * - 与 adminMenu 字段相同 + children 递归
 * - 用独立类型避免与扁平菜单的 GraphQL 类型冲突
 */
@ObjectType('AdminMenuNode', { description: '管理端菜单树节点' })
export class AdminMenuNode extends AdminMenu {
    @Field(() => [AdminMenuNode])
    children!: AdminMenuNode[];
}

/**
 * 当前账户的菜单 + 权限码（登录后查询）
 * - 用途：前端动态路由 + 按钮权限控制
 * - 与前端 api/menus.ts 的 `getCurrentUserMenus()` 返回结构一一对应
 */
@ObjectType('CurrentAdminMenus', { description: '当前账户的菜单树 + 权限码' })
export class CurrentAdminMenus {
    @Field(() => [AdminMenuNode], { description: '当前账户可见的菜单树' })
    menus!: AdminMenuNode[];

    @Field(() => [String], { description: '当前账户聚合后的权限码列表' })
    permissions!: string[];
}
