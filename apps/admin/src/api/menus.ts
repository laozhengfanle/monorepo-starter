/**
 * 菜单 API
 *
 * 接口拆分：
 *   - GraphQL Query：菜单树 / 当前用户菜单 / 扁平列表
 *   - GraphQL Mutation：新增 / 更新 / 删除
 *
 * 后端路由对照：
 *   GraphQL query { adminMenuTree }                → 完整菜单树（前端动态路由用）
 *   GraphQL query { adminMenus }                   → 扁平菜单列表（管理页用）
 *   GraphQL query { currentAdminMenus }            → 当前用户菜单 + 权限码
 *   GraphQL mutation { createAdminMenu }           → 新增菜单
 *   GraphQL mutation { updateAdminMenu }           → 更新菜单
 *   GraphQL mutation { deleteAdminMenu }           → 删除菜单（硬删除，不可恢复）
 */
import type { MenuNode, CreateMenuParams, UpdateMenuParams } from '@/features/iam/menus/types';
import { gqlQuery } from '@/shared/request/graphql-client';

// ============================================================
// GraphQL Query（查询操作）
// ============================================================

/** 获取扁平菜单列表 */
export async function getMenus(): Promise<MenuNode[]> {
    const data = await gqlQuery<{ adminMenus: MenuNode[] }>(
        `
      query AdminMenus {
        adminMenus {
          id name type path icon sort enabled visible
          routeName component permissionCode keepAlive activeMenuId parentId
          createdAt updatedAt
        }
      }
    `,
    );
    return data.adminMenus;
}

/** 获取完整菜单树（含 folder / menu / button） */
export async function getMenuTree(): Promise<MenuNode[]> {
    const data = await gqlQuery<{ adminMenuTree: MenuNode[] }>(
        `
      query AdminMenuTree {
        adminMenuTree {
          id name type path icon sort enabled visible
          routeName component permissionCode keepAlive activeMenuId parentId
          children {
            id name type path icon sort enabled visible
            routeName component permissionCode keepAlive activeMenuId parentId
            children {
              id name type path icon sort enabled visible
              routeName component permissionCode keepAlive activeMenuId parentId
              children {
                id name type path icon sort enabled visible
                routeName component permissionCode keepAlive activeMenuId parentId
              }
            }
          }
        }
      }
    `,
    );
    return data.adminMenuTree;
}

/** 获取当前用户的路由菜单 + 权限码 */
export async function getCurrentUserMenus(): Promise<{
    menus: MenuNode[];
    permissions: string[];
}> {
    const data = await gqlQuery<{
        currentAdminMenus: { menus: MenuNode[]; permissions: string[] };
    }>(
        `
      query CurrentAdminMenus {
        currentAdminMenus {
          menus {
            id name type path icon sort enabled visible
            routeName component permissionCode keepAlive activeMenuId parentId
            children {
              id name type path icon sort enabled visible
              routeName component permissionCode keepAlive activeMenuId parentId
              children {
                id name type path icon sort enabled visible
                routeName component permissionCode keepAlive activeMenuId parentId
              }
            }
          }
          permissions
        }
      }
    `,
    );
    return data.currentAdminMenus;
}

// ============================================================
// GraphQL Mutation（写操作）
// ============================================================

/** 新增菜单 */
export async function createMenu(params: CreateMenuParams): Promise<MenuNode> {
    const data = await gqlQuery<{ createAdminMenu: MenuNode }>(
        `
      mutation CreateAdminMenu($input: CreateAdminMenuInput!) {
        createAdminMenu(input: $input) {
          id name type path icon sort enabled visible
          routeName component permissionCode keepAlive activeMenuId parentId
        }
      }
    `,
        { variables: { input: params } },
    );
    return data.createAdminMenu;
}

/** 更新菜单 */
export async function updateMenu(id: string, params: UpdateMenuParams): Promise<MenuNode> {
    const data = await gqlQuery<{ updateAdminMenu: MenuNode }>(
        `
      mutation UpdateAdminMenu($id: ID!, $input: UpdateAdminMenuInput!) {
        updateAdminMenu(id: $id, input: $input) {
          id name type path icon sort enabled visible
          routeName component permissionCode keepAlive activeMenuId parentId
        }
      }
    `,
        { variables: { id, input: params } },
    );
    return data.updateAdminMenu;
}

/**
 * 删除菜单（硬删除，不可恢复，级联清理子节点关联）
 * - 后端从 DB 物理 DELETE 记录
 * - 二次确认：必须在 UI 层用 dialog.warning + onPositiveClick 包裹，调用方负责
 */
export async function deleteMenu(id: string): Promise<boolean> {
    const data = await gqlQuery<{ deleteAdminMenu: boolean }>(
        `
      mutation DeleteAdminMenu($id: ID!) {
        deleteAdminMenu(id: $id)
      }
    `,
        { variables: { id } },
    );
    return data.deleteAdminMenu;
}
