/**
 * 认证 GraphQL API
 *
 *   - GraphQL：me 查询（读操作，灵活组合字段）
 *
 * 后端路由对照：
 *   GraphQL query { me }    → 获取当前用户信息 + 权限 + 菜单
 */
import type { MenuNode } from '@/features/iam/menus/types';
import { gqlQuery } from '@/shared/request/graphql-client';

// ============================================================
// 类型
// ============================================================
export interface AdminInfo {
    id: string;
    name: string;
    avatar?: string;
    email?: string;
    phone?: string;
    role?: string;
    createAt?: string;
    /** 扩展字段：允许后端返回未在类型中定义的额外属性 */
    [key: string]: unknown;
}

export interface MeResponse {
    admin: AdminInfo;
    permissions: string[];
    /** 菜单树（folder + menu，不含 button），兼容 MenuNode[] */
    menus: MenuNode[];
    /** 当前用户的角色码列表 */
    roles: string[];
}

// ============================================================
// GraphQL API（查询操作）
// ============================================================

/**
 * me 查询的 GraphQL 文档
 *
 * 使用扁平菜单查询（不含嵌套 children），前端通过 parentId 重建树。
 * 优势：
 *   - 支持任意层级菜单，不受嵌套层数限制
 *   - 字段只写一次，修改时无需同步多处
 *   - 后端只需返回扁平数组，查询更高效
 *
 * 后端需配合：menus 字段返回扁平数组，每个节点包含 parentId。
 * 如果后端仍返回嵌套树，menuToRoutes 中的 ensureTree 会自动兼容。
 */
const ME_QUERY = `
  query Me {
    me {
      ... on AdminMe {
        accountId
        username
        nickname
        avatar
        roles
        permissions
        menus {
          id
          parentId
          name
          type
          path
          icon
          visible
          sort
          enabled
          routeName
          component
          permissionCode
          keepAlive
          activeMenuId
          # 重要：必须查 children 字段，否则后端 buildMenuTree 后的子节点会丢失，
          # 前端拿到 3 个根节点但子菜单全为 null，menuToRoutes 也无法递归生成子路由
          # （后端 AdminPermissionCacheService.getAccountAuth 返回的是已构建的树，不是扁平数组）
          children {
            id
            parentId
            name
            type
            path
            icon
            visible
            sort
            enabled
            routeName
            component
            permissionCode
            keepAlive
            activeMenuId
            children {
              id
              parentId
              name
              type
              path
              icon
              visible
              sort
              enabled
              routeName
              component
              permissionCode
              keepAlive
              activeMenuId
            }
          }
        }
      }
    }
  }
`;

/** 获取当前用户信息（含权限码 + 菜单树），走 GraphQL */
export async function getMe(): Promise<MeResponse> {
    const data = await gqlQuery<{ me: AdminMeResponse }>(ME_QUERY);
    const adminMe = data.me;

    return {
        admin: {
            id: adminMe.accountId,
            name: adminMe.nickname || adminMe.username,
            avatar: adminMe.avatar,
            role: adminMe.roles?.[0],
        },
        permissions: adminMe.permissions,
        menus: adminMe.menus,
        roles: adminMe.roles,
    };
}

/** GraphQL me 查询返回的 AdminMe 类型 */
interface AdminMeResponse {
    accountId: string;
    username: string;
    nickname: string;
    avatar: string;
    roles: string[];
    permissions: string[];
    menus: MenuNode[];
}
