/**
 * 角色 API
 *
 * 接口拆分：
 *   - GraphQL Query：角色列表 / 角色详情
 *   - GraphQL Mutation：新增 / 更新 / 删除 / 保存权限
 *
 * 后端路由对照：
 *   GraphQL query { adminRoles(enabled) }             → 一次性返回所有角色（后端无分页参数）
 *   GraphQL query { adminRole }                        → 查询角色详情（含 menuIds）
 *   GraphQL mutation { createAdminRole }               → 新增角色
 *   GraphQL mutation { updateAdminRole }               → 更新角色（不允许改 code，code 是不可变锚点）
 *   GraphQL mutation { deleteAdminRole }               → 删除角色（硬删除，不可恢复）
 *   GraphQL mutation { assignRoleMenus }               → 保存角色权限
 *
 * 字段映射说明（与后端 AdminRole 对齐）：
 *   - 后端字段 description → 前端 RoleRow 暴露为 desc（业务术语，UI 列名用 desc）
 *   - 后端 enabled: boolean → 前端 status: '启用' | '禁用'（业务术语，下拉用 '启用/禁用'）
 *   - 后端 userCount → 前端 userCount：持有该角色的活跃账户数
 *   - 后端 menuCount → 前端 menuCount：关联菜单数（详情接口用）
 *   - 后端 code → 前端 code：角色唯一机器编码，create 必填且不可变（不可变由后端 Update 不接受保证）
 *   - 角色数量本身不大（< 100），后端一次返回全量，前端做客户端分页/筛选
 */
import { gqlQuery } from '@/shared/request/graphql-client';

// ============================================================
// 类型
// ============================================================
export interface RoleRow {
    id: string;
    name: string;
    /** 角色唯一机器编码（后端 code，全局 @unique）。create 必填，update 不允许改。 */
    code: string;
    /** 描述（后端 description） */
    desc: string;
    /** 状态（后端 enabled 转换：true → '启用'，false → '禁用'） */
    status: '启用' | '禁用';
    /** 关联用户数（后端 userCount，持有该角色的活跃账户数） */
    userCount: number;
}

/** 角色详情（含菜单权限 ID 数组），用于权限分配界面 */
export interface RoleDetail extends RoleRow {
    menuIds: string[];
}

// ============================================================
// GraphQL Query（查询操作）
// ============================================================

/**
 * 获取全量角色列表
 * - 后端 adminRoles(enabled) 不分页，一次返回所有角色
 * - enabled=undefined：不过滤启用状态（默认）
 * - enabled=true：只返回 enabled=true 的角色（对应 UI「正常」筛选）
 * - enabled=false：只返回 enabled=false 的角色（对应 UI「禁用」筛选）
 * - 前端在 API 层统一转换为 RoleRow 形状（desc/status/userCount）
 * - 上层组件需要分页时自己做客户端切片（角色数量 < 100，无性能问题）
 */
export async function getRoles(enabled?: boolean): Promise<RoleRow[]> {
    const data = await gqlQuery<{ adminRoles: AdminRoleRaw[] }>(
        `
      query AdminRoles($enabled: Boolean) {
        adminRoles(enabled: $enabled) { id name code description enabled menuCount userCount }
      }
    `,
        { variables: { enabled: enabled ?? null } },
    );
    return data.adminRoles.map(toRoleRow);
}

/**
 * 兼容旧签名：忽略入参的 page/pageSize，直接返回全量
 * - 部分上层（AdminsPage）按 PaginatedParams 风格调用，保留参数以避免改一堆
 * - 返回值改为数组，调用方需要自己处理
 * - 默认 includeDeleted=false：保持「只看正常」的最小权限视图
 */
export async function getRolesPaginated(_params: { page: number; pageSize: number }): Promise<{
    data: RoleRow[];
    total: number;
}> {
    const roles = await getRoles();
    return { data: roles, total: roles.length };
}

/** 获取角色详情（含菜单权限 ID 数组） */
export async function getRoleById(id: string): Promise<RoleDetail> {
    const data = await gqlQuery<{ adminRole: AdminRoleRaw }>(
        `
      query AdminRole($id: ID!) {
        adminRole(id: $id) { id name code description enabled menuCount menuIds }
      }
    `,
        { variables: { id } },
    );
    return { ...toRoleRow(data.adminRole), menuIds: data.adminRole.menuIds ?? [] };
}

// ============================================================
// GraphQL Mutation（写操作）
// ============================================================

/** 保存角色权限（全量替换 menuIds）
 *
 * 关键点：后端 schema 是 `assignRoleMenus(input: AssignRoleMenusInput!)`，
 *  不能像 Query 那样直接传 roleId / menuIds 平铺参数，
 *  必须用 input 对象包裹，否则 GraphQL 校验失败：
 *    "Unknown argument \"roleId\" on field \"Mutation.assignRoleMenus\""
 *    "Field \"assignRoleMenus\" argument \"input\" of type \"AssignRoleMenusInput!\" is required, but it was not provided."
 *
 *  menuIds 允许传空数组（用于清空角色全部权限），
 *  后端 AssignRoleMenusSchema 未强制 min(1)。
 */
export async function saveRolePermissions(roleId: string, menuIds: string[]): Promise<boolean> {
    const data = await gqlQuery<{ assignRoleMenus: boolean }>(
        `
      mutation AssignRoleMenus($input: AssignRoleMenusInput!) {
        assignRoleMenus(input: $input)
      }
    `,
        { variables: { input: { roleId, menuIds } } },
    );
    return data.assignRoleMenus;
}

/** 新增角色
 *
 * 后端 CreateAdminRoleInput 字段：name / code(必填) / description? / enabled?
 * - code 是角色唯一机器编码（全局 @unique），前端必须由调用方提供有意义的字符串
 *   （如 `super_admin` / `ops` / `cs`），不能再用伪 `role_<timestamp>` 凑数
 * - 后端 Zod CreateAdminRoleSchema 校验 code：以字母开头，只含字母数字下划线，最长 50 字符
 *   前端弹窗已对齐此规则；这里透传即可，不再做 slugify
 */
export async function createRole(params: {
    name: string;
    code: string;
    desc: string;
    status: '启用' | '禁用';
}): Promise<RoleRow> {
    const data = await gqlQuery<{ createAdminRole: AdminRoleRaw }>(
        `
      mutation CreateAdminRole($input: CreateAdminRoleInput!) {
        createAdminRole(input: $input) { id name code description enabled menuCount }
      }
    `,
        {
            variables: {
                input: {
                    name: params.name,
                    code: params.code,
                    description: params.desc,
                    enabled: params.status === '启用',
                },
            },
        },
    );
    return toRoleRow(data.createAdminRole);
}

/** 更新角色 */
export async function updateRole(id: string, updates: Partial<Omit<RoleRow, 'id'>>): Promise<RoleRow> {
    // 把前端的 desc/status 转成后端的 description/enabled
    const input: Record<string, unknown> = {};
    if (updates.name !== undefined) input.name = updates.name;
    if (updates.desc !== undefined) input.description = updates.desc;
    if (updates.status !== undefined) input.enabled = updates.status === '启用';

    const data = await gqlQuery<{ updateAdminRole: AdminRoleRaw }>(
        `
      mutation UpdateAdminRole($id: ID!, $input: UpdateAdminRoleInput!) {
        updateAdminRole(id: $id, input: $input) { id name description enabled menuCount }
      }
    `,
        { variables: { id, input } },
    );
    return toRoleRow(data.updateAdminRole);
}

/** 删除角色（硬删除，不可恢复，super_admin 不可删） */
export async function deleteRole(id: string): Promise<boolean> {
    const data = await gqlQuery<{ deleteAdminRole: boolean }>(
        `
      mutation DeleteAdminRole($id: ID!) {
        deleteAdminRole(id: $id)
      }
    `,
        { variables: { id } },
    );
    return data.deleteAdminRole;
}

// ============================================================
// 内部工具
// ============================================================

/** 后端 AdminRole 原始形状 */
interface AdminRoleRaw {
    id: string;
    name: string;
    code: string;
    description?: string;
    enabled: boolean;
    /** 关联菜单数 */
    menuCount: number;
    /** 关联用户数（持有该角色的活跃账户数） */
    userCount?: number;
    menuIds?: string[];
}

/**
 * 把后端 AdminRole 转换为前端 RoleRow
 * - code 直接透传（前端不再生成，createRole 由调用方提供）
 * - description → desc
 * - enabled → status ('启用' / '禁用')
 */
function toRoleRow(raw: AdminRoleRaw): RoleRow {
    return {
        id: raw.id,
        name: raw.name,
        code: raw.code,
        desc: raw.description ?? '',
        status: raw.enabled ? '启用' : '禁用',
        // 后端 userCount 字段：持有该角色的活跃账户数（后端新增字段，旧接口可能不返回，fallback 0）
        userCount: raw.userCount ?? 0,
    };
}
