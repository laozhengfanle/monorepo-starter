/**
 * 特例授权 API
 *
 * 接口拆分：
 *   - GraphQL Query：查询账户特例权限
 *   - GraphQL Mutation：批量保存账户特例权限（全量替换）
 *
 * 后端路由对照：
 *   GraphQL query { accountMenus }              → 查询账户特例权限
 *   GraphQL mutation { saveAccountMenus }       → 保存账户特例权限
 *
 * 三态模型（Account 维度的 grant/deny 覆写）：
 *   - default：不存任何记录 → 走角色基线
 *   - grant：显式授权（拥有此权限）
 *   - deny：  显式禁止（即使角色基线有，也被显式拒绝）
 */
import { gqlQuery } from '@/shared/request/graphql-client';

// ============================================================
// 类型
// ============================================================

/** 特例类型：与后端 enum 保持一致 */
export type AccountMenuType = 'grant' | 'deny';

/** 单条账户-菜单特例记录（持久化到 DB） */
export interface AccountMenuRow {
    id: string;
    accountId: string;
    menuId: string;
    menuName: string;
    type: AccountMenuType;
}

/** 批量保存的入参项 */
export interface AccountMenuOverride {
    menuId: string;
    type: AccountMenuType;
}

// ============================================================
// GraphQL Query（查询操作）
// ============================================================

/** 获取某账户的特例权限列表（不含 default 状态） */
export async function getAccountMenus(accountId: string): Promise<AccountMenuRow[]> {
    const data = await gqlQuery<{ accountMenus: AccountMenuRow[] }>(
        `
      query AccountMenus($accountId: ID!) {
        accountMenus(accountId: $accountId) {
          id accountId menuId menuName type
        }
      }
    `,
        { variables: { accountId } },
    );
    return data.accountMenus;
}

// ============================================================
// GraphQL Mutation（写操作）
// ============================================================

/**
 * 批量保存账户特例权限（全量替换）
 *
 * 语义：传入的 overrides 列表是「全量」，后端会先清空该账户所有现存记录，再插入新列表。
 * 传空数组 = 清除该账户所有特例授权（回到完全走角色基线）。
 */
export async function saveAccountMenus(accountId: string, overrides: AccountMenuOverride[]): Promise<boolean> {
    const data = await gqlQuery<{ saveAccountMenus: boolean }>(
        `
      mutation SaveAccountMenus($accountId: ID!, $overrides: [AccountMenuOverrideInput!]!) {
        saveAccountMenus(accountId: $accountId, overrides: $overrides)
      }
    `,
        {
            variables: {
                accountId,
                overrides: overrides.map((o) => ({ menuId: o.menuId, type: o.type })),
            },
        },
    );
    return data.saveAccountMenus;
}
