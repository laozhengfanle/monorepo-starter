// 共享包入口文件 — 统一导出所有公共类型和工具

// ── 工具 ──
export { newId } from './id.js';

// ── common schemas ──
export { PaginationSchema, UuidSchema, EmptyObjectSchema, ErrorResponseSchema } from './schemas/common.schema.js';
export type { PaginationInput } from './schemas/common.schema.js';

// ── auth schemas ──
export { AdminLoginSchema } from './schemas/auth/admin-auth.schema.js';
export type { AdminLoginInput } from './schemas/auth/admin-auth.schema.js';

export {
    MemberSmsSendSchema,
    MemberSmsLoginSchema,
    ResetPasswordSendSchema,
    ResetPasswordSchema,
} from './schemas/auth/member-auth.schema.js';
export type {
    MemberSmsSendInput,
    MemberSmsLoginInput,
    ResetPasswordSendInput,
    ResetPasswordInput,
} from './schemas/auth/member-auth.schema.js';

export { TokenRefreshSchema, LogoutSchema, ChangePasswordSchema } from './schemas/auth/auth-common.schema.js';
export type { TokenRefreshInput, ChangePasswordInput } from './schemas/auth/auth-common.schema.js';

// ── admin schemas ──
export {
    CreateAdminAccountSchema,
    UpdateAdminAccountSchema,
    QueryAdminAccountSchema,
    AssignAdminAccountRolesSchema,
    ResetAdminPasswordSchema,
} from './schemas/admin/admin-account.schema.js';
export type {
    CreateAdminAccountInput,
    UpdateAdminAccountInput,
    QueryAdminAccountInput,
    AssignAdminAccountRolesInput,
    ResetAdminPasswordInput,
} from './schemas/admin/admin-account.schema.js';

export {
    CreateAdminRoleSchema,
    UpdateAdminRoleSchema,
    AssignRoleMenusSchema,
} from './schemas/admin/admin-role.schema.js';
export type {
    CreateAdminRoleInput,
    UpdateAdminRoleInput,
    AssignRoleMenusInput,
} from './schemas/admin/admin-role.schema.js';

export { CreateAdminMenuSchema, UpdateAdminMenuSchema } from './schemas/admin/admin-menu.schema.js';
export type { CreateAdminMenuInput, UpdateAdminMenuInput } from './schemas/admin/admin-menu.schema.js';

// ── member schemas ──
export { UpdateMemberProfileSchema, QueryMemberProfileSchema } from './schemas/member/member-profile.schema.js';
export type { UpdateMemberProfileInput, QueryMemberProfileInput } from './schemas/member/member-profile.schema.js';

// ── upload schemas ──
export { QueryUploadSchema, UploadFileMetaSchema } from './schemas/upload/upload.schema.js';
export type { QueryUploadInput, UploadFileMeta } from './schemas/upload/upload.schema.js';

// ── account identity schemas (Phase 8) ──
// 用途：登录后绑定/解绑第三方登录方式（手机号、微信、Apple）
export {
    OAuthProviderEnum,
    BindPhoneInputSchema,
    UnbindPhoneInputSchema,
    BindOAuthInputSchema,
    UnbindOAuthInputSchema,
} from './schemas/account/account-identity.schema.js';
export type {
    OAuthProvider,
    BindPhoneInput,
    UnbindPhoneInput,
    BindOAuthInput,
    UnbindOAuthInput,
} from './schemas/account/account-identity.schema.js';

// ── zod rules ──
export { zodToRules } from './utils/zod-rules.js';
export type { FieldRuleSet } from './utils/zod-rules.js';

// ── system config schemas ──
// 说明：DB schema 没有 type/group/description 字段，对应的 SystemConfigTypeSchema / SystemConfigType 也已移除。
export {
    CreateSystemConfigSchema,
    UpdateSystemConfigSchema,
    SystemConfigKeySchema,
    /** 新接口（适配前端 e5b1fd8 重构） */
    ConfigUpdateItemSchema,
    ConfigUpdateValueSchema,
    BatchUpdateConfigsSchema,
} from './schemas/admin/system-config.schema.js';
export type {
    CreateSystemConfigInput,
    UpdateSystemConfigInput,
    SystemConfigKey,
    /** 新接口类型 */
    ConfigUpdateItem,
    ConfigUpdateValue,
    BatchUpdateConfigsInput,
} from './schemas/admin/system-config.schema.js';

// ── 401 自动刷新（CRITICAL F3 修复）──
// 抽离自 admin/shared/request/auth-refresh.ts，admin / web 共用
export { create401Refresh, refreshAuthToken, __reset401RefreshModuleForTests } from './composables/use401Refresh.js';
export type { Create401RefreshOptions, Refresh401Interceptor } from './composables/use401Refresh.js';

// admin / web 共用错误码常量
export { ERROR_CODES, ERROR_CODE_INFO, getErrorCodeInfo } from './errors/error-codes.js';
export type { ErrorCode } from './errors/error-codes.js';
export type { ErrorCodeInfo } from './types/error.js';
