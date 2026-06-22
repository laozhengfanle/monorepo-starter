/**
 * 管理员账户 API
 *
 * 接口拆分：
 *   - GraphQL Query：管理员列表（分页）/ 管理员详情 / 软删视图全量
 *   - GraphQL Mutation：新增 / 更新 / 删除 / 硬删 / 恢复管理员
 *
 * 后端路由对照（已重命名为 AdminAccount*）：
 *   GraphQL query { adminAccounts }                → 分页查询管理员列表（参数走 input 嵌套）
 *   GraphQL query { adminAccount }                 → 查询管理员详情
 *   GraphQL query { adminAccounts(includeDeleted)} → 软删视图全量（用大 pageSize 模拟）
 *   GraphQL mutation { createAdminAccount }        → 新增管理员
 *   GraphQL mutation { updateAdminAccount }        → 更新管理员
 *   GraphQL mutation { deleteAdminAccount }        → 删除管理员
 *   GraphQL mutation { hardDeleteAdminAccount }    → 硬删管理员
 *   GraphQL mutation { restoreAdminAccount }       → 恢复管理员
 *
 * 字段映射说明（与后端 AdminAccount 对齐）：
 *   - 后端返回 createdAt，前端 AccountRow 暴露为 createAt（业务术语，与"创建时间"列名一致）
 *   - 后端 roles/roleIds 是数组，前端在 API 层降维为单值（取首元素），
 *     因为 seed 数据每个 admin 实际只绑定一个角色
 *   - 后端无 username/email 独立筛选，仅 keyword 模糊匹配（username + nickname），
 *     前端把 username + email 用空格拼接后传入
 *
 * 命名约定：
 *   - GraphQL field / operation / input type：与后端 schema 严格对齐（adminAccount*）
 *   - 业务函数名（getAccounts / createAdmin / updateAdmin / deleteAdmin 等）：保留 C 端简化风格
 *   - 类型名（AccountRow / AccountRaw）：用 Account 前缀与文件主题保持一致
 */
import { gqlQuery } from '@/shared/request/graphql-client';
import type { PaginatedResult, PaginatedParams, UserFilterParams } from './helpers';

// ============================================================
// 类型
// ============================================================
/**
 * 前端表格展示用的 AccountRow
 *
 * 字段对照（与后端 AdminAccount 严格对齐）：
 *   - username           → 登录用户名（AccountIdentity.identifier，仅新增时可填）
 *   - nickname           → 昵称（AdminProfile.nickname，必填）
 *   - phone              → 手机号（AdminProfile.phone）
 *   - email              → 邮箱（AdminProfile.email）
 *   - enabled            → 账户启用状态（Account.enabled）
 *   - roleIds / roles    → 完整角色数组（与后端对齐）
 *   - roleId / role      → 兼容字段：取 roleIds[0] / roles[0]（用于特列授权、过滤等单值场景）
 *   - avatar             → 头像 URL（AdminProfile.avatar）
 *   - createAt           → 创建时间（沿用业务术语，避免大范围改表格列定义）
 *   - deletedAt          → 软删除时间（后端 AdminAccount.deletedAt，ISO 字符串或 null）
 *                          - 配合 ListDisplayFilter 的 displayMode 控制列表里是否展示已删除记录
 *                          - 仅在 list query 带 includeDeleted=true 时才可能非空
 *
 * 设计取舍：roleId/role 仍保留为单值，因为：
 *   - 特例授权弹窗（AccountPermissionModal）需要单值做基线
 *   - 筛选区只有一个角色下拉（多选太繁琐，seed 数据每个 admin 实际只绑定一个角色）
 *   - 弹窗用多选 NSelect，提交时传 roleIds 数组
 */
export interface AccountRow {
    id: string;
    username: string;
    nickname: string;
    phone: string;
    email: string;
    enabled: boolean;
    /** 角色 ID 数组（与后端 roleIds 对齐，弹窗多选用） */
    roleIds: string[];
    /** 角色名 数组（与后端 roles 对齐） */
    roles: string[];
    /** 兼容字段：取 roleIds[0]，用于特列授权 / 筛选回填 */
    roleId: string;
    /** 兼容字段：取 roles[0]，用于表格展示 */
    role: string;
    avatar: string;
    /** 创建时间 */
    createAt: string;
    /**
     * 软删除时间（后端 AdminAccount.deletedAt，GraphQL DateTime → ISO 字符串）
     * - null / undefined：未删除（正常显示）
     * - 非空 ISO 字符串：已软删除，可走「恢复 / 彻底删除」流程
     * - 配合 ListDisplayFilter 的 displayMode 控制列表里是否展示已删除记录
     */
    deletedAt: string | null;
    /**
     * 账号是否被登录失败计数锁定
     * - true: 5 次失败被锁，30 分钟内不能登录（表格显示「解锁」按钮）
     * - false: 正常状态（不显示「解锁」按钮）
     * - 来自后端 AdminAccount.isLocked 字段（@ResolveField 实时查 Redis）
     */
    isLocked?: boolean;
}

// ============================================================
// GraphQL Query（查询操作）
// ============================================================

/**
 * 分页 + 筛选获取管理员列表
 * - 后端接受 input 嵌套结构（{ page, pageSize, keyword, enabled, includeDeleted }）
 * - 前端把 username + email 用空格拼接后作为 keyword 模糊匹配
 * - 后端返回 { items, total, page, pageSize }，前端在 API 层映射成 { data, total }
 *
 * enabled 筛选：
 * - undefined / null：不过滤（全部）
 * - true：只查「正常」账户
 * - false：只查「禁用」账户
 */
export async function getAccounts(params: PaginatedParams & UserFilterParams): Promise<PaginatedResult<AccountRow>> {
    const { page, pageSize, username, email, enabled, includeDeleted } = params;
    // 多个筛选字段用空格拼接，匹配后端 keyword 模糊搜索（username + nickname）
    const keyword = [username, email].filter(Boolean).join(' ') || undefined;

    const data = await gqlQuery<{ adminAccounts: { items: AccountRow[]; total: number } }>(
        `
      query AdminAccounts($input: QueryAdminAccountInput) {
        adminAccounts(input: $input) {
          items { id username nickname phone email enabled roleIds roles avatar createdAt deletedAt isLocked }
          total
        }
      }
    `,
        {
            variables: {
                input: {
                    page,
                    pageSize,
                    keyword,
                    enabled,
                    // includeDeleted 不传时 GraphQL 默认 false，行为是"仅看活跃"
                    includeDeleted: includeDeleted || undefined,
                },
            },
        },
    );
    return {
        data: data.adminAccounts.items.map(toAccountRow),
        total: data.adminAccounts.total,
    };
}

/**
 * 获取全量管理员账户列表（软删视图专用，不分页）
 * - 与 getAccounts 的区别：返回 AccountRow[] 而非 PaginatedResult<AccountRow>，无分页/总数
 * - 用途：ListDisplayFilter 的「已删除 / 全部」视图下需要看完整列表（含已软删），
 *   而 getAccounts 那种分页 + 模糊匹配的管理视图不适配
 * - includeDeleted=false：仅看活跃账户（默认）
 * - includeDeleted=true：含已软删账户（用于「恢复 / 彻底删除」流程）
 * - 后端 adminAccounts(input: { includeDeleted, page, pageSize })：
 *   软删视图通常数据量小（管理后台被删账户量级 < 100），
 *   这里用 pageSize=100 一次取完（后端 PaginationSchema 限制 pageSize ≤ 100），避免后端新增"不分页 list"接口
 *
 * 函数命名说明：原 spec 表格中 getAdmins → getAccounts（分页版），
 * 已存在的「软删视图全量」原 getAccounts 重命名为 getAllAccounts 以避免同名冲突。
 */
export async function getAllAccounts(includeDeleted = false): Promise<AccountRow[]> {
    const data = await gqlQuery<{ adminAccounts: { items: AccountRow[] } }>(
        `
      query AllAdminAccounts($input: QueryAdminAccountInput) {
        adminAccounts(input: $input) {
          items { id username nickname phone email enabled roleIds roles avatar createdAt deletedAt isLocked }
        }
      }
    `,
        { variables: { input: { includeDeleted, page: 1, pageSize: 100 } } },
    );
    return data.adminAccounts.items.map(toAccountRow);
}

/** 按 id 查找管理员 */
export async function getAccountById(id: string): Promise<AccountRow> {
    const data = await gqlQuery<{ adminAccount: AccountRow }>(
        `
      query AdminAccount($id: ID!) {
        adminAccount(id: $id) { id username nickname phone email enabled roleIds roles avatar createdAt deletedAt isLocked }
      }
    `,
        { variables: { id } },
    );
    return toAccountRow(data.adminAccount);
}

// ============================================================
// GraphQL Mutation（写操作）
// ============================================================

/**
 * 新增管理员
 *
 * 后端 CreateAdminAccountInput 字段：username / nickname(必填) / phone? / email? / roleIds? / avatar?
 * 注：后端 Create 不接 password / enabled，密码是后端生成随机密码后下发（mustChangePassword=true 强提示用户改）
 *
 * 前端 AccountRow 兼容字段 roleId/role 不再单独传（用 roleIds 数组）
 *
 * avatar：
 * - undefined / ''：不设置头像（DB 默认 ''，前端显示 User icon 占位）
 * - URL 字符串：来自 /api/upload/avatar 接口返回值
 */
export async function createAdmin(input: {
    username: string;
    nickname: string;
    phone?: string;
    email?: string;
    roleIds?: string[];
    avatar?: string;
    password?: string;
}): Promise<AccountRow> {
    const data = await gqlQuery<{ createAdminAccount: AccountRow }>(
        `
      mutation CreateAdminAccount($input: CreateAdminAccountInput!) {
        createAdminAccount(input: $input) { id username nickname phone email enabled roleIds roles avatar createdAt deletedAt }
      }
    `,
        {
            variables: {
                input: {
                    username: input.username,
                    nickname: input.nickname || input.username,
                    phone: input.phone || undefined,
                    email: input.email || undefined,
                    roleIds: input.roleIds?.length ? input.roleIds : undefined,
                    avatar: input.avatar || undefined,
                    password: input.password || undefined,
                },
            },
        },
    );
    return toAccountRow(data.createAdminAccount);
}

/**
 * 更新管理员信息
 *
 * 后端 UpdateAdminAccountInput 字段：nickname? / phone? / email? / enabled? / roleIds? / avatar?
 *   - username 不能改（要改 username 必须走专门换号流程）
 *   - 不传字段 → 后端不更新（partial update 语义）
 *   - roleIds: 不传则不更新，传 [] 则清空
 *   - avatar: 不传则不更新，传 '' 则清空，传 URL 则替换
 *
 * 前端 AccountRow 兼容字段 roleId/role 不再单独传（用 roleIds 数组）
 */
export async function updateAdmin(
    id: string,
    input: {
        nickname?: string;
        phone?: string;
        email?: string;
        enabled?: boolean;
        roleIds?: string[];
        avatar?: string;
    },
): Promise<AccountRow> {
    const data = await gqlQuery<{ updateAdminAccount: AccountRow }>(
        `
      mutation UpdateAdminAccount($id: ID!, $input: UpdateAdminAccountInput!) {
        updateAdminAccount(id: $id, input: $input) { id username nickname phone email enabled roleIds roles avatar createdAt deletedAt }
      }
    `,
        {
            variables: {
                id,
                // 注意：avatar 保留空字符串语义（undefined 不传 / '' 传空清空 / URL 传新）
                // 不像其他字段用 `|| undefined` 抹掉空值，因为 avatar 显式清空是有业务意义的
                input: {
                    nickname: input.nickname || undefined,
                    phone: input.phone || undefined,
                    email: input.email || undefined,
                    enabled: input.enabled,
                    roleIds: input.roleIds,
                    avatar: input.avatar,
                },
            },
        },
    );
    return toAccountRow(data.updateAdminAccount);
}

/** 删除管理员 */
export async function deleteAdmin(id: string): Promise<boolean> {
    const data = await gqlQuery<{ deleteAdminAccount: boolean }>(
        `
      mutation DeleteAdminAccount($id: ID!) {
        deleteAdminAccount(id: $id)
      }
    `,
        { variables: { id } },
    );
    return data.deleteAdminAccount;
}

/**
 * 彻底删除管理员（硬删除，不可恢复）
 * - 后端直接从 DB DELETE 记录，绕过软删除
 * - 业务上只对「已软删除」的管理员开放入口（前端 UI 在 v-if row.deletedAt 时才渲染按钮）
 * - 二次确认：必须在 UI 层用 dialog.warning + onPositiveClick 包裹，调用方负责
 * - 权限码：global:trash:list（后端 AdminPermissionGuard 强制）
 */
export async function hardDeleteAccount(id: string): Promise<boolean> {
    const data = await gqlQuery<{ hardDeleteAdminAccount: boolean }>(
        `
      mutation HardDeleteAdminAccount($id: ID!) {
        hardDeleteAdminAccount(id: $id)
      }
    `,
        { variables: { id } },
    );
    return data.hardDeleteAdminAccount;
}

/**
 * 恢复软删除的管理员（清空 deletedAt）
 * - 仅对「已软删除」的管理员有效（前端 UI 在 v-if row.deletedAt 时才渲染按钮）
 * - 唯一字段（username）已被其他活跃记录占用时恢复会失败，由后端抛 ConflictException
 * - 二次确认：必须在 UI 层用 dialog.warning + onPositiveClick 包裹，调用方负责
 * - 权限码：global:trash:list（全局软删除权限，跨所有表）
 */
export async function restoreAccount(id: string): Promise<boolean> {
    const data = await gqlQuery<{ restoreAdminAccount: boolean }>(
        `
      mutation RestoreAdminAccount($id: ID!) {
        restoreAdminAccount(id: $id)
      }
    `,
        { variables: { id } },
    );
    return data.restoreAdminAccount;
}

/**
 * 重置管理员密码（admin→admin 强制改密）
 *
 * 业务语义：
 * - 不要求旧密码（典型场景：用户忘记密码 / 安全事件强制改密）
 * - 前端必须做"再次输入"一致性提示（NInput.Password 输两遍）
 * - 后端 ResetAdminPasswordSchema 二次校验：长度 8+、字母+数字、两次输入一致
 *
 * 失败处理：
 * - 后端 40001/40003 等：弹窗 message.error 展示 error.message
 * - 后端 20001/20003（无权限）：弹窗 message.error 后跳转登录
 * - 网络错误：弹窗 message.error('网络错误，请重试')
 *
 * 成功之后：
 * - 后端自动 invalidateAccount(id)，所以该用户持有的旧 accessToken 在权限/菜单层面会失效
 * - 注意：JWT 本身还能用满 15 分钟（旧 token 没被吊销），改密不会强制下线
 *   若要"改密即踢出"，需要后端加 token blacklist，不在本期范围
 *
 * 权限码：iam:admin:update（重置密码与编辑共用权限码，避免部分成功的迷惑提示）
 */
export async function resetAdminPassword(id: string, newPassword: string, confirmPassword: string): Promise<boolean> {
    const data = await gqlQuery<{ resetAdminAccountPassword: boolean }>(
        `
      mutation ResetAdminAccountPassword($id: ID!, $input: ResetAdminAccountPasswordInput!) {
        resetAdminAccountPassword(id: $id, input: $input)
      }
    `,
        {
            variables: {
                id,
                input: { newPassword, confirmPassword },
            },
        },
    );
    return data.resetAdminAccountPassword;
}

/**
 * 解锁管理员账户（清空登录失败计数）
 * - 后端 unlockAdminAccount mutation
 * - 区别于 resetAdminPassword：只清锁，不改密
 * - 场景：用户 5 次失败被锁 30 分钟，超级管理员要立即恢复其登录
 * - 权限码：iam:admin:update
 * - 成功后该账号的失败计数清零，可立即重新登录
 */
export async function unlockAdminAccount(id: string): Promise<boolean> {
    const data = await gqlQuery<{ unlockAdminAccount: boolean }>(
        `
      mutation UnlockAdminAccount($id: ID!) {
        unlockAdminAccount(id: $id)
      }
    `,
        {
            variables: { id },
        },
    );
    return data.unlockAdminAccount;
}

// ============================================================
// 内部工具
// ============================================================

/**
 * 后端 AdminAccount 原始形状
 * - roles/roleIds 是数组，createdAt 是 ISO 时间
 * - 后端 Update 时只返回更新后的字段，未更新的字段可能为 undefined
 * - deletedAt：后端软删除时间（GraphQL DateTime）
 *   - null 表示未删除，Date 表示已软删
 *   - 前端透传为 string | null（ISO 字符串）
 */
interface AccountRaw {
    id: string;
    username: string;
    nickname?: string;
    phone?: string;
    email?: string;
    enabled?: boolean;
    avatar?: string;
    roleIds?: string[];
    roles?: string[];
    createdAt?: string | Date;
    deletedAt?: string | Date | null;
    isLocked?: boolean;
}

/**
 * 把后端原始数据映射为前端表格用的 AccountRow
 * - 完整保留 roleIds/roles 数组（弹窗多选用）
 * - 同时保留单值兼容字段 roleId/role（取首元素，用于特列授权 / 筛选 / 表格展示）
 * - 空值统一用 "" / false / [] 占位，避免 UI 渲染 undefined
 * - deletedAt：原样透传（Date 转 ISO 字符串，null/undefined 视为未删除）
 */
function toAccountRow(raw: AccountRaw): AccountRow {
    const roleIds = raw.roleIds ?? [];
    const roles = raw.roles ?? [];
    return {
        id: raw.id,
        username: raw.username,
        nickname: raw.nickname ?? '',
        phone: raw.phone ?? '',
        email: raw.email ?? '',
        enabled: raw.enabled ?? true,
        roleIds,
        roles,
        // 兼容字段：取首元素（用于单值场景，如特列授权的"基线角色"）
        roleId: roleIds[0] ?? '',
        role: roles[0] ?? '',
        avatar: raw.avatar ?? '',
        createAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt ?? ''),
        deletedAt: raw.deletedAt instanceof Date ? raw.deletedAt.toISOString() : (raw.deletedAt ?? null),
        isLocked: raw.isLocked ?? false,
    };
}
