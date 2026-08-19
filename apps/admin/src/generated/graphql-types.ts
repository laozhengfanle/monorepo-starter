export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** 任意 JSON 值（对象 / 数组 / 字符串 / 数字 / 布尔 / null） */
  JSON: { input: unknown; output: unknown; }
};

export type AdminAccount = {
  accountId: Scalars['ID']['output'];
  avatar: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  deletedAt?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  nickname: Scalars['String']['output'];
  roleCodes: Array<Scalars['String']['output']>;
  username: Scalars['String']['output'];
};

export type AdminAccountQueryInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  roleCode?: InputMaybe<Scalars['String']['input']>;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type AdminMe = {
  accountId: Scalars['ID']['output'];
  avatar: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  menus: Array<AdminMenuNode>;
  nickname: Scalars['String']['output'];
  permissions: Array<Scalars['String']['output']>;
  phone: Scalars['String']['output'];
  roleCodes: Array<Scalars['String']['output']>;
  username: Scalars['String']['output'];
};

export type AdminMenuNode = {
  children: Array<AdminMenuNode>;
  code: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  icon?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  parentId?: Maybe<Scalars['ID']['output']>;
  path?: Maybe<Scalars['String']['output']>;
  sort: Scalars['Int']['output'];
  type: Scalars['String']['output'];
  visible: Scalars['Boolean']['output'];
};

export type AdminRole = {
  code: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  permissionCodes: Array<Scalars['String']['output']>;
};

export type AuditLogItem = {
  accountId?: Maybe<Scalars['String']['output']>;
  accountUsername?: Maybe<Scalars['String']['output']>;
  action: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  detail?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  ip?: Maybe<Scalars['String']['output']>;
  resourceId?: Maybe<Scalars['String']['output']>;
  resourceType?: Maybe<Scalars['String']['output']>;
  userAgent?: Maybe<Scalars['String']['output']>;
};

export type AuditLogQueryInput = {
  action?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  resourceType?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
};

export type BatchUpdateConfigsInput = {
  updates: Array<ConfigUpdateItemInput>;
};

export type CacheKey = {
  key: Scalars['String']['output'];
  size: Scalars['Int']['output'];
  ttl: Scalars['Int']['output'];
  type: Scalars['String']['output'];
  value?: Maybe<Scalars['String']['output']>;
};

export type CacheStats = {
  hitRate: Scalars['String']['output'];
  uptime: Scalars['String']['output'];
  usedMemory: Scalars['String']['output'];
};

export type ClearAuditLogsResult = {
  deletedCount: Scalars['Int']['output'];
};

export type ConfigUpdateItemInput = {
  key: Scalars['String']['input'];
  value: Scalars['JSON']['input'];
};

export type CreateAdminAccountInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  nickname?: InputMaybe<Scalars['String']['input']>;
  password: Scalars['String']['input'];
  roleCodes: Array<Scalars['String']['input']>;
  username: Scalars['String']['input'];
};

export type CreateDictItemInput = {
  dictTypeId: Scalars['ID']['input'];
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  label: Scalars['String']['input'];
  remark?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['Int']['input']>;
  value: Scalars['String']['input'];
};

export type CreateDictTypeInput = {
  code: Scalars['String']['input'];
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  remark?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateMenuInput = {
  code: Scalars['String']['input'];
  icon?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  parentId?: InputMaybe<Scalars['ID']['input']>;
  path?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['Int']['input']>;
  type: Scalars['String']['input'];
  visible?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateRoleInput = {
  code: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  permissionCodes?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** 操作类型分布项 */
export type DashboardDistItem = {
  /** 饼图颜色 */
  color: Scalars['String']['output'];
  /** 操作中文标签（字典 audit_action） */
  label: Scalars['String']['output'];
  /** 占比（0-100） */
  percent: Scalars['Int']['output'];
};

/** 最近操作记录 */
export type DashboardOpLog = {
  /** 操作内容中文标签（字典 audit_action） */
  content: Scalars['String']['output'];
  /** IP */
  ip: Scalars['String']['output'];
  /** 资源类型中文标签（字典 audit_resource） */
  module: Scalars['String']['output'];
  /** 序号 */
  seq: Scalars['Int']['output'];
  /** 操作时间（YYYY-MM-DD HH:mm:ss） */
  time: Scalars['String']['output'];
  /** 操作类型分类：login/logout/create/update/delete/reset/grant/export */
  type: Scalars['String']['output'];
  /** 操作者用户名（无则系统） */
  user: Scalars['String']['output'];
};

/** 分页操作记录 */
export type DashboardOpLogPage = {
  list: Array<DashboardOpLog>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

/** 仪表盘统计卡片 */
export type DashboardStat = {
  /** 标签名，如 管理员 / 角色 / 菜单项 / 近7日操作 */
  label: Scalars['String']['output'];
  /** 较上周趋势百分比（正=上升，负=下降） */
  trend: Scalars['Int']['output'];
  /** 当前值 */
  value: Scalars['Int']['output'];
};

/** 敏感操作趋势数据点 */
export type DashboardTrendItem = {
  /** 高危操作次数 */
  highRisk: Scalars['Int']['output'];
  /** 时间段标签（周一 / MM-DD / M月） */
  label: Scalars['String']['output'];
  /** 低危操作次数 */
  lowRisk: Scalars['Int']['output'];
  /** 中危操作次数 */
  midRisk: Scalars['Int']['output'];
};

export type DeleteCacheKeysResult = {
  deletedCount: Scalars['Int']['output'];
  keys: Array<Scalars['String']['output']>;
};

export type Mutation = {
  batchUpdateConfigs: Array<SystemConfig>;
  clearAuditLogs: ClearAuditLogsResult;
  clearCacheByPattern: Scalars['Int']['output'];
  createAdminAccount: AdminAccount;
  createDictItem: SysDictItem;
  createDictType: SysDictType;
  createMenu: AdminMenuNode;
  createRole: AdminRole;
  deleteAdminAccount: AdminAccount;
  deleteAuditLog: Scalars['Boolean']['output'];
  deleteCacheKey: Scalars['Boolean']['output'];
  deleteCacheKeys: DeleteCacheKeysResult;
  deleteDictItem: Scalars['Boolean']['output'];
  deleteDictType: Scalars['Boolean']['output'];
  deleteMenu: AdminMenuNode;
  deleteRole: AdminRole;
  deleteUploadFile: UploadFile;
  updateAdminAccount: AdminAccount;
  updateDictItem: SysDictItem;
  updateDictType: SysDictType;
  updateMenu: AdminMenuNode;
  updateRole: AdminRole;
  updateTurnstileConfig: SystemConfig;
};


export type MutationBatchUpdateConfigsArgs = {
  input: BatchUpdateConfigsInput;
};


export type MutationClearCacheByPatternArgs = {
  pattern: Scalars['String']['input'];
};


export type MutationCreateAdminAccountArgs = {
  input: CreateAdminAccountInput;
};


export type MutationCreateDictItemArgs = {
  input: CreateDictItemInput;
};


export type MutationCreateDictTypeArgs = {
  input: CreateDictTypeInput;
};


export type MutationCreateMenuArgs = {
  input: CreateMenuInput;
};


export type MutationCreateRoleArgs = {
  input: CreateRoleInput;
};


export type MutationDeleteAdminAccountArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteAuditLogArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCacheKeyArgs = {
  key: Scalars['String']['input'];
};


export type MutationDeleteCacheKeysArgs = {
  keys: Array<Scalars['String']['input']>;
};


export type MutationDeleteDictItemArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDictTypeArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteMenuArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteRoleArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteUploadFileArgs = {
  id: Scalars['ID']['input'];
};


export type MutationUpdateAdminAccountArgs = {
  id: Scalars['ID']['input'];
  input: UpdateAdminAccountInput;
};


export type MutationUpdateDictItemArgs = {
  id: Scalars['ID']['input'];
  input: UpdateDictItemInput;
};


export type MutationUpdateDictTypeArgs = {
  id: Scalars['ID']['input'];
  input: UpdateDictTypeInput;
};


export type MutationUpdateMenuArgs = {
  id: Scalars['ID']['input'];
  input: UpdateMenuInput;
};


export type MutationUpdateRoleArgs = {
  id: Scalars['ID']['input'];
  input: UpdateRoleInput;
};


export type MutationUpdateTurnstileConfigArgs = {
  input: UpdateConfigInput;
};

export type PaginatedAdminAccounts = {
  items: Array<AdminAccount>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type PaginatedAuditLogs = {
  items: Array<AuditLogItem>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type PaginatedUploadFiles = {
  items: Array<UploadFile>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type PermissionCode = {
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type Query = {
  adminAccounts: PaginatedAdminAccounts;
  adminConfigs: Array<SystemConfig>;
  adminLogs: PaginatedAuditLogs;
  adminRoles: Array<AdminRole>;
  cacheKey: CacheKey;
  cacheKeyTotal: Scalars['Int']['output'];
  cacheKeys: Array<CacheKey>;
  cacheStats: CacheStats;
  dashboardDistribution: Array<DashboardDistItem>;
  dashboardOperationLogs: DashboardOpLogPage;
  dashboardStats: Array<DashboardStat>;
  dashboardTrend: Array<DashboardTrendItem>;
  exportAuditLogs: Array<AuditLogItem>;
  me: AdminMe;
  menuTree: Array<AdminMenuNode>;
  permissionCodes: Array<PermissionCode>;
  publicConfigs: Array<SystemConfig>;
  storageConfig?: Maybe<SystemConfig>;
  sysDictTypes: Array<SysDictType>;
  turnstileConfig?: Maybe<SystemConfig>;
  uploadFiles: PaginatedUploadFiles;
};


export type QueryAdminAccountsArgs = {
  query: AdminAccountQueryInput;
};


export type QueryAdminLogsArgs = {
  query: AuditLogQueryInput;
};


export type QueryCacheKeyArgs = {
  key: Scalars['String']['input'];
};


export type QueryCacheKeyTotalArgs = {
  pattern?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCacheKeysArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  pattern?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDashboardOperationLogsArgs = {
  page?: Scalars['Int']['input'];
  pageSize?: Scalars['Int']['input'];
};


export type QueryDashboardTrendArgs = {
  range?: Scalars['String']['input'];
};


export type QueryExportAuditLogsArgs = {
  query: AuditLogQueryInput;
};


export type QueryUploadFilesArgs = {
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
};

export type SysDictItem = {
  createdAt: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  label: Scalars['String']['output'];
  remark?: Maybe<Scalars['String']['output']>;
  sort: Scalars['Int']['output'];
  updatedAt: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type SysDictType = {
  code: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  items: Array<SysDictItem>;
  name: Scalars['String']['output'];
  remark?: Maybe<Scalars['String']['output']>;
  sort: Scalars['Int']['output'];
  updatedAt: Scalars['String']['output'];
};

export type SystemConfig = {
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  remark?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
  updatedBy?: Maybe<Scalars['String']['output']>;
  value: Scalars['JSON']['output'];
};

export type UpdateAdminAccountInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  nickname?: InputMaybe<Scalars['String']['input']>;
  roleCodes?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateConfigInput = {
  value: Scalars['JSON']['input'];
};

export type UpdateDictItemInput = {
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  label?: InputMaybe<Scalars['String']['input']>;
  remark?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateDictTypeInput = {
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  remark?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateMenuInput = {
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  icon?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  parentId?: InputMaybe<Scalars['ID']['input']>;
  path?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
  visible?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateRoleInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  permissionCodes?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UploadFile = {
  accountId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  deletedAt?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  originalName: Scalars['String']['output'];
  size: Scalars['Int']['output'];
  storedName: Scalars['String']['output'];
  url: Scalars['String']['output'];
};
