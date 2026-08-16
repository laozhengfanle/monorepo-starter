/**
 * 审计词表单一事实源（纯常量，无任何 Nest 依赖）：
 * - AUDIT_ACTIONS：审计动作（audit_log.action），字典 audit_action 由它生成
 * - AUDIT_RESOURCES：审计资源类型（audit_log.resourceType），字典 audit_resource 由它生成
 * - AUDIT_ACTION_LABELS / AUDIT_RESOURCE_LABELS：字典中文标签（seed 生成用）
 * - AUDIT_ACTION_RESOURCE_MAP：action → 默认 resourceType（AuditService.write 未显式传时自动补全）
 *
 * 概念模型：
 * - action = 动词（做了什么）：login_success / account_created / role_assigned ...
 * - resourceType = 名词（作用于哪类实体）：admin_account / admin_role / auth ...
 * - 一对多：一个资源类型聚合多个动作（筛选资源类型可跨动作归组查看实体生命周期）
 * - 特例：DICT_* 动作既作用于 sys_dict_type（类型）也作用于 sys_dict_item（项），
 *   默认映射取 sys_dict_type，写 sys_dict_item 时调用方显式覆盖。
 *
 * 新增动作的纪律：
 * 1. 在 AUDIT_ACTIONS 追加常量；
 * 2. 在 AUDIT_ACTION_LABELS 补中文标签；
 * 3. 在 AUDIT_ACTION_RESOURCE_MAP 声明默认资源类型；
 * 4. seed 重跑后字典自动同步（audit_action/audit_resource 由本文件生成）。
 */
export const AUDIT_ACTIONS = {
  // ── 认证 ──
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_LOCKED: 'login_locked',
  LOGOUT: 'logout',
  PASSWORD_CHANGED: 'password_changed',
  TOKEN_REFRESHED: 'token_refreshed',
  TOKEN_REUSED: 'token_reused',
  // ── 管理账户 ──
  ACCOUNT_CREATED: 'account_created',
  ACCOUNT_UPDATED: 'account_updated',
  ACCOUNT_ENABLED: 'account_enabled',
  ACCOUNT_DISABLED: 'account_disabled',
  ACCOUNT_DELETED: 'account_deleted',
  ACCOUNT_RESTORED: 'account_restored',
  ACCOUNT_HARD_DELETED: 'account_hard_deleted',
  ROLE_ASSIGNED: 'role_assigned',
  ROLE_REVOKED: 'role_revoked',
  ACCOUNT_PERMISSION_CHANGED: 'account_permission_changed',
  // ── 管理角色 ──
  ROLE_CREATED: 'role_created',
  ROLE_UPDATED: 'role_updated',
  ROLE_DELETED: 'role_deleted',
  PERMISSION_CHANGED: 'permission_changed',
  // ── 管理菜单 ──
  MENU_CREATED: 'menu_created',
  MENU_UPDATED: 'menu_updated',
  MENU_DELETED: 'menu_deleted',
  // ── 文件 ──
  FILE_UPLOADED: 'file_uploaded',
  FILE_DELETED: 'file_deleted',
  // ── 系统 ──
  CONFIG_UPDATED: 'config_updated',
  AUDIT_CLEARED: 'audit_cleared',
  // ── 数据字典 ──
  DICT_CREATED: 'dict_created',
  DICT_UPDATED: 'dict_updated',
  DICT_DELETED: 'dict_deleted',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_RESOURCES = {
  ADMIN_ACCOUNT: 'admin_account',
  ADMIN_ROLE: 'admin_role',
  ADMIN_MENU: 'admin_menu',
  SYSTEM_CONFIG: 'system_config',
  UPLOAD_FILE: 'upload_file',
  ACCOUNT_IDENTITY: 'account_identity',
  AUTH: 'auth',
  AUDIT_LOG: 'audit_log',
  SYS_DICT_TYPE: 'sys_dict_type',
  SYS_DICT_ITEM: 'sys_dict_item',
} as const;

export type AuditResource = (typeof AUDIT_RESOURCES)[keyof typeof AUDIT_RESOURCES];

/** 审计动作中文标签（字典 audit_action 生成源） */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AUDIT_ACTIONS.LOGIN_SUCCESS]: '登录成功',
  [AUDIT_ACTIONS.LOGIN_FAILED]: '登录失败',
  [AUDIT_ACTIONS.LOGIN_LOCKED]: '登录锁定',
  [AUDIT_ACTIONS.LOGOUT]: '退出登录',
  [AUDIT_ACTIONS.PASSWORD_CHANGED]: '修改密码',
  [AUDIT_ACTIONS.TOKEN_REFRESHED]: '刷新令牌',
  [AUDIT_ACTIONS.TOKEN_REUSED]: '令牌重用',
  [AUDIT_ACTIONS.ACCOUNT_CREATED]: '创建账户',
  [AUDIT_ACTIONS.ACCOUNT_UPDATED]: '更新账户',
  [AUDIT_ACTIONS.ACCOUNT_ENABLED]: '启用账户',
  [AUDIT_ACTIONS.ACCOUNT_DISABLED]: '禁用账户',
  [AUDIT_ACTIONS.ACCOUNT_DELETED]: '删除账户',
  [AUDIT_ACTIONS.ACCOUNT_RESTORED]: '恢复账户',
  [AUDIT_ACTIONS.ACCOUNT_HARD_DELETED]: '彻底删除账户',
  [AUDIT_ACTIONS.ROLE_ASSIGNED]: '分配角色',
  [AUDIT_ACTIONS.ROLE_REVOKED]: '撤销角色',
  [AUDIT_ACTIONS.ACCOUNT_PERMISSION_CHANGED]: '账户权限变更',
  [AUDIT_ACTIONS.ROLE_CREATED]: '创建角色',
  [AUDIT_ACTIONS.ROLE_UPDATED]: '更新角色',
  [AUDIT_ACTIONS.ROLE_DELETED]: '删除角色',
  [AUDIT_ACTIONS.PERMISSION_CHANGED]: '权限变更',
  [AUDIT_ACTIONS.MENU_CREATED]: '创建菜单',
  [AUDIT_ACTIONS.MENU_UPDATED]: '更新菜单',
  [AUDIT_ACTIONS.MENU_DELETED]: '删除菜单',
  [AUDIT_ACTIONS.FILE_UPLOADED]: '上传文件',
  [AUDIT_ACTIONS.FILE_DELETED]: '删除文件',
  [AUDIT_ACTIONS.CONFIG_UPDATED]: '配置更新',
  [AUDIT_ACTIONS.AUDIT_CLEARED]: '清空审计',
  [AUDIT_ACTIONS.DICT_CREATED]: '创建字典',
  [AUDIT_ACTIONS.DICT_UPDATED]: '更新字典',
  [AUDIT_ACTIONS.DICT_DELETED]: '删除字典',
};

/** 审计资源类型中文标签（字典 audit_resource 生成源） */
export const AUDIT_RESOURCE_LABELS: Record<AuditResource, string> = {
  [AUDIT_RESOURCES.ADMIN_ACCOUNT]: '管理账户',
  [AUDIT_RESOURCES.ADMIN_ROLE]: '管理角色',
  [AUDIT_RESOURCES.ADMIN_MENU]: '管理菜单',
  [AUDIT_RESOURCES.SYSTEM_CONFIG]: '系统配置',
  [AUDIT_RESOURCES.UPLOAD_FILE]: '上传文件',
  [AUDIT_RESOURCES.ACCOUNT_IDENTITY]: '账户身份',
  [AUDIT_RESOURCES.AUTH]: '认证',
  [AUDIT_RESOURCES.AUDIT_LOG]: '审计日志',
  [AUDIT_RESOURCES.SYS_DICT_TYPE]: '字典类型',
  [AUDIT_RESOURCES.SYS_DICT_ITEM]: '字典项',
};

/** action → 默认 resourceType（write 未显式传 resourceType 时自动补全，杜绝漏填/不对称） */
export const AUDIT_ACTION_RESOURCE_MAP: Record<AuditAction, AuditResource> = {
  // 认证类统一归属 auth（登录/登出/刷新/重用是认证域事件）
  [AUDIT_ACTIONS.LOGIN_SUCCESS]: AUDIT_RESOURCES.AUTH,
  [AUDIT_ACTIONS.LOGIN_FAILED]: AUDIT_RESOURCES.AUTH,
  [AUDIT_ACTIONS.LOGIN_LOCKED]: AUDIT_RESOURCES.AUTH,
  [AUDIT_ACTIONS.LOGOUT]: AUDIT_RESOURCES.AUTH,
  [AUDIT_ACTIONS.PASSWORD_CHANGED]: AUDIT_RESOURCES.ACCOUNT_IDENTITY,
  [AUDIT_ACTIONS.TOKEN_REFRESHED]: AUDIT_RESOURCES.AUTH,
  [AUDIT_ACTIONS.TOKEN_REUSED]: AUDIT_RESOURCES.AUTH,
  // 账户生命周期（含角色分配/撤销，资源是账户）
  [AUDIT_ACTIONS.ACCOUNT_CREATED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ACCOUNT_UPDATED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ACCOUNT_ENABLED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ACCOUNT_DISABLED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ACCOUNT_DELETED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ACCOUNT_RESTORED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ACCOUNT_HARD_DELETED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ROLE_ASSIGNED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ROLE_REVOKED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  [AUDIT_ACTIONS.ACCOUNT_PERMISSION_CHANGED]: AUDIT_RESOURCES.ADMIN_ACCOUNT,
  // 角色管理
  [AUDIT_ACTIONS.ROLE_CREATED]: AUDIT_RESOURCES.ADMIN_ROLE,
  [AUDIT_ACTIONS.ROLE_UPDATED]: AUDIT_RESOURCES.ADMIN_ROLE,
  [AUDIT_ACTIONS.ROLE_DELETED]: AUDIT_RESOURCES.ADMIN_ROLE,
  [AUDIT_ACTIONS.PERMISSION_CHANGED]: AUDIT_RESOURCES.ADMIN_ROLE,
  // 菜单/权限点
  [AUDIT_ACTIONS.MENU_CREATED]: AUDIT_RESOURCES.ADMIN_MENU,
  [AUDIT_ACTIONS.MENU_UPDATED]: AUDIT_RESOURCES.ADMIN_MENU,
  [AUDIT_ACTIONS.MENU_DELETED]: AUDIT_RESOURCES.ADMIN_MENU,
  // 文件
  [AUDIT_ACTIONS.FILE_UPLOADED]: AUDIT_RESOURCES.UPLOAD_FILE,
  [AUDIT_ACTIONS.FILE_DELETED]: AUDIT_RESOURCES.UPLOAD_FILE,
  // 系统
  [AUDIT_ACTIONS.CONFIG_UPDATED]: AUDIT_RESOURCES.SYSTEM_CONFIG,
  [AUDIT_ACTIONS.AUDIT_CLEARED]: AUDIT_RESOURCES.AUDIT_LOG,
  // 字典（sys_dict_item 场景由调用方显式覆盖）
  [AUDIT_ACTIONS.DICT_CREATED]: AUDIT_RESOURCES.SYS_DICT_TYPE,
  [AUDIT_ACTIONS.DICT_UPDATED]: AUDIT_RESOURCES.SYS_DICT_TYPE,
  [AUDIT_ACTIONS.DICT_DELETED]: AUDIT_RESOURCES.SYS_DICT_TYPE,
};
