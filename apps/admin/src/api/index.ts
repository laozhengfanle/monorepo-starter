/**
 * API 统一导出
 *
 * 所有页面和 store 统一从此导入 API 函数与类型。
 *
 * 接口拆分策略（对照后端 NestJS 开发文档）：
 *   - RESTful：仅认证相关（login / refresh / logout），因为涉及 cookie 和特殊安全处理
 *   - GraphQL：其他所有操作（Query + Mutation），GraphQL 作为主 API 网关
 *
 * 应用启动后，所有请求通过 Vite proxy 转发到真实后端（开发期）/ 反向代理（生产期）。
 */

// HTTP 请求工具（RESTful，仅认证用）
export { ApiError, setAuthStatus, removeAuthStatus, hasAuthStatus } from '@/shared/request/request';

// GraphQL 客户端
export { GraphQLError, type GraphQLErrorItem } from '@/shared/request/graphql-client';

// 工具类型
export { type PaginatedResult, type PaginatedParams } from './helpers';

// 认证（RESTful — BFF 层）
export { login, refreshToken, logout, type LoginParams } from './bff/auth';

// 认证（GraphQL — 查询当前用户）
export { getMe, type AdminInfo, type MeResponse } from './auth';

// 管理员账户（GraphQL Query + Mutation）
export {
    getAccounts,
    getAllAccounts,
    getAccountById,
    createAdmin,
    updateAdmin,
    deleteAdmin,
    hardDeleteAccount,
    restoreAccount,
    resetAdminPassword,
    unlockAdminAccount,
    type AccountRow,
} from './accounts';

// 角色（GraphQL Query + Mutation）
export {
    getRoles,
    getRoleById,
    saveRolePermissions,
    createRole,
    updateRole,
    deleteRole,
    type RoleRow,
    type RoleDetail,
} from './roles';

// 菜单（GraphQL Query + Mutation）
export { getMenuTree, getMenus, getCurrentUserMenus, createMenu, updateMenu, deleteMenu } from './menus';
export type { CreateMenuParams, UpdateMenuParams } from '@/features/iam/menus/types';

// 日志（GraphQL Query + Mutation）
export { getLogs, deleteLog, clearLogs, exportLogs, type LogRow } from './logs';

// Dashboard（GraphQL Query）
export {
    getStats,
    getTrendData,
    getDistribution,
    getOperationLogs,
    getQuickEntries,
    getNotices,
    type StatCard,
    type TrendItem,
    type DistItem,
    type OpLog,
    type QuickEntry,
    type Notice,
} from './dashboard';

// 特例授权（GraphQL Query + Mutation）
export {
    getAccountMenus,
    saveAccountMenus,
    type AccountMenuRow,
    type AccountMenuOverride,
    type AccountMenuType,
} from './account-menu';

// 系统配置（GraphQL Query + Mutation）
export {
    getConfigs,
    updateConfig,
    batchUpdateConfigs,
    type ConfigRow,
    type ConfigUpdateInput,
    type ConfigUpdateResult,
} from './configs';

// 缓存管理（GraphQL Query + Mutation）
export {
    listCacheKeys,
    getCacheKeyTotal,
    getCacheKey,
    getCacheStats,
    deleteCacheKey,
    deleteCacheKeys,
    clearCacheByPattern,
    type CacheKeyRow,
    type CacheStatsRow,
    type DeleteCacheKeysResult,
} from './cache';

// 上传（RESTful — BFF 层，multipart/form-data）
export { uploadAvatar, type UploadResult } from './bff/uploads';

// 文档（RESTful — BFF 层，公共只读）
export { getDocsList, getDocContent, type DocMeta, type DocContent } from './bff/docs';
