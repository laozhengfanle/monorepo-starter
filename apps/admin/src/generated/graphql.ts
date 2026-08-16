import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** 任意 JSON 值（对象 / 数组 / 字符串 / 数字 / 布尔 / null） */
  JSON: { input: any; output: any; }
};

export type AdminAccount = {
  __typename?: 'AdminAccount';
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
  __typename?: 'AdminMe';
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
  __typename?: 'AdminMenuNode';
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
  __typename?: 'AdminRole';
  code: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  permissionCodes: Array<Scalars['String']['output']>;
};

export type AuditLogItem = {
  __typename?: 'AuditLogItem';
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

export type AuthResult = {
  __typename?: 'AuthResult';
  accessToken: Scalars['String']['output'];
  expiresIn: Scalars['Int']['output'];
  refreshToken: Scalars['String']['output'];
};

export type BatchUpdateConfigsInput = {
  updates: Array<ConfigUpdateItemInput>;
};

export type CacheKey = {
  __typename?: 'CacheKey';
  key: Scalars['String']['output'];
  size: Scalars['Int']['output'];
  ttl: Scalars['Int']['output'];
  type: Scalars['String']['output'];
  value?: Maybe<Scalars['String']['output']>;
};

export type CacheStats = {
  __typename?: 'CacheStats';
  hitRate: Scalars['String']['output'];
  uptime: Scalars['String']['output'];
  usedMemory: Scalars['String']['output'];
};

export type ClearAuditLogsResult = {
  __typename?: 'ClearAuditLogsResult';
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

export type DeleteCacheKeysResult = {
  __typename?: 'DeleteCacheKeysResult';
  deletedCount: Scalars['Int']['output'];
  keys: Array<Scalars['String']['output']>;
};

export type LoginInput = {
  password: Scalars['String']['input'];
  username: Scalars['String']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
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
  login: AuthResult;
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


export type MutationLoginArgs = {
  input: LoginInput;
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
  __typename?: 'PaginatedAdminAccounts';
  items: Array<AdminAccount>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type PaginatedAuditLogs = {
  __typename?: 'PaginatedAuditLogs';
  items: Array<AuditLogItem>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type PaginatedUploadFiles = {
  __typename?: 'PaginatedUploadFiles';
  items: Array<UploadFile>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type PermissionCode = {
  __typename?: 'PermissionCode';
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  adminAccounts: PaginatedAdminAccounts;
  adminConfigs: Array<SystemConfig>;
  adminLogs: PaginatedAuditLogs;
  adminRoles: Array<AdminRole>;
  cacheKey: CacheKey;
  cacheKeyTotal: Scalars['Int']['output'];
  cacheKeys: Array<CacheKey>;
  cacheStats: CacheStats;
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


export type QueryExportAuditLogsArgs = {
  query: AuditLogQueryInput;
};


export type QueryUploadFilesArgs = {
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
};

export type SysDictItem = {
  __typename?: 'SysDictItem';
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
  __typename?: 'SysDictType';
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
  __typename?: 'SystemConfig';
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
  __typename?: 'UploadFile';
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

export type AdminAccountsQueryVariables = Exact<{
  query: AdminAccountQueryInput;
}>;


export type AdminAccountsQuery = { __typename?: 'Query', adminAccounts: { __typename?: 'PaginatedAdminAccounts', total: number, page: number, pageSize: number, items: Array<{ __typename?: 'AdminAccount', accountId: string, username: string, nickname: string, email: string, avatar: string, enabled: boolean, roleCodes: Array<string>, createdAt: string, deletedAt?: string | null }> } };

export type AdminRolesQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminRolesQuery = { __typename?: 'Query', adminRoles: Array<{ __typename?: 'AdminRole', id: string, code: string, name: string }> };

export type CreateAdminAccountMutationVariables = Exact<{
  input: CreateAdminAccountInput;
}>;


export type CreateAdminAccountMutation = { __typename?: 'Mutation', createAdminAccount: { __typename?: 'AdminAccount', accountId: string, username: string, nickname: string, email: string, enabled: boolean, roleCodes: Array<string> } };

export type UpdateAdminAccountMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateAdminAccountInput;
}>;


export type UpdateAdminAccountMutation = { __typename?: 'Mutation', updateAdminAccount: { __typename?: 'AdminAccount', accountId: string, username: string, nickname: string, email: string, enabled: boolean, roleCodes: Array<string> } };

export type DeleteAdminAccountMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteAdminAccountMutation = { __typename?: 'Mutation', deleteAdminAccount: { __typename?: 'AdminAccount', accountId: string } };

export type MenuNodeFieldsFragment = { __typename?: 'AdminMenuNode', id: string, parentId?: string | null, name: string, code: string, type: string, path?: string | null, icon?: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string };

export type MenuTreeQueryVariables = Exact<{ [key: string]: never; }>;


export type MenuTreeQuery = { __typename?: 'Query', menuTree: Array<{ __typename?: 'AdminMenuNode', id: string, parentId?: string | null, name: string, code: string, type: string, path?: string | null, icon?: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string, children: Array<{ __typename?: 'AdminMenuNode', id: string, parentId?: string | null, name: string, code: string, type: string, path?: string | null, icon?: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string, children: Array<{ __typename?: 'AdminMenuNode', id: string, parentId?: string | null, name: string, code: string, type: string, path?: string | null, icon?: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string, children: Array<{ __typename?: 'AdminMenuNode', id: string, parentId?: string | null, name: string, code: string, type: string, path?: string | null, icon?: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string, children: Array<{ __typename?: 'AdminMenuNode', id: string, parentId?: string | null, name: string, code: string, type: string, path?: string | null, icon?: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string }> }> }> }> }> };

export type CreateMenuMutationVariables = Exact<{
  input: CreateMenuInput;
}>;


export type CreateMenuMutation = { __typename?: 'Mutation', createMenu: { __typename?: 'AdminMenuNode', id: string, parentId?: string | null, name: string, code: string, type: string, path?: string | null, icon?: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string } };

export type UpdateMenuMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateMenuInput;
}>;


export type UpdateMenuMutation = { __typename?: 'Mutation', updateMenu: { __typename?: 'AdminMenuNode', id: string, parentId?: string | null, name: string, code: string, type: string, path?: string | null, icon?: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string } };

export type DeleteMenuMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteMenuMutation = { __typename?: 'Mutation', deleteMenu: { __typename?: 'AdminMenuNode', id: string } };

export type AdminRoleListQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminRoleListQuery = { __typename?: 'Query', adminRoles: Array<{ __typename?: 'AdminRole', id: string, name: string, code: string, description: string, enabled: boolean, permissionCodes: Array<string>, createdAt: string }> };

export type PermissionCodeListQueryVariables = Exact<{ [key: string]: never; }>;


export type PermissionCodeListQuery = { __typename?: 'Query', permissionCodes: Array<{ __typename?: 'PermissionCode', id: string, code: string, name: string, type: string }> };

export type CreateRoleMutationVariables = Exact<{
  input: CreateRoleInput;
}>;


export type CreateRoleMutation = { __typename?: 'Mutation', createRole: { __typename?: 'AdminRole', id: string, name: string, code: string, description: string, enabled: boolean, permissionCodes: Array<string> } };

export type UpdateRoleMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateRoleInput;
}>;


export type UpdateRoleMutation = { __typename?: 'Mutation', updateRole: { __typename?: 'AdminRole', id: string, name: string, code: string, description: string, enabled: boolean, permissionCodes: Array<string> } };

export type DeleteRoleMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteRoleMutation = { __typename?: 'Mutation', deleteRole: { __typename?: 'AdminRole', id: string } };

export type DashboardAccountsTotalQueryVariables = Exact<{ [key: string]: never; }>;


export type DashboardAccountsTotalQuery = { __typename?: 'Query', adminAccounts: { __typename?: 'PaginatedAdminAccounts', total: number } };

export type DashboardRolesTotalQueryVariables = Exact<{ [key: string]: never; }>;


export type DashboardRolesTotalQuery = { __typename?: 'Query', adminRoles: Array<{ __typename?: 'AdminRole', id: string }> };

export type SysDictItemFieldsFragment = { __typename?: 'SysDictItem', id: string, label: string, value: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string };

export type SysDictTypeFieldsFragment = { __typename?: 'SysDictType', id: string, code: string, name: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string, items: Array<{ __typename?: 'SysDictItem', id: string, label: string, value: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string }> };

export type SysDictTypesQueryVariables = Exact<{ [key: string]: never; }>;


export type SysDictTypesQuery = { __typename?: 'Query', sysDictTypes: Array<{ __typename?: 'SysDictType', id: string, code: string, name: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string, items: Array<{ __typename?: 'SysDictItem', id: string, label: string, value: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string }> }> };

export type CreateDictTypeMutationVariables = Exact<{
  input: CreateDictTypeInput;
}>;


export type CreateDictTypeMutation = { __typename?: 'Mutation', createDictType: { __typename?: 'SysDictType', id: string, code: string, name: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string, items: Array<{ __typename?: 'SysDictItem', id: string, label: string, value: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string }> } };

export type UpdateDictTypeMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateDictTypeInput;
}>;


export type UpdateDictTypeMutation = { __typename?: 'Mutation', updateDictType: { __typename?: 'SysDictType', id: string, code: string, name: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string, items: Array<{ __typename?: 'SysDictItem', id: string, label: string, value: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string }> } };

export type DeleteDictTypeMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteDictTypeMutation = { __typename?: 'Mutation', deleteDictType: boolean };

export type CreateDictItemMutationVariables = Exact<{
  input: CreateDictItemInput;
}>;


export type CreateDictItemMutation = { __typename?: 'Mutation', createDictItem: { __typename?: 'SysDictItem', id: string, label: string, value: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string } };

export type UpdateDictItemMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateDictItemInput;
}>;


export type UpdateDictItemMutation = { __typename?: 'Mutation', updateDictItem: { __typename?: 'SysDictItem', id: string, label: string, value: string, remark?: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string } };

export type DeleteDictItemMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteDictItemMutation = { __typename?: 'Mutation', deleteDictItem: boolean };

export type SystemConfigFieldsFragment = { __typename?: 'SystemConfig', id: string, key: string, value: any, remark?: string | null, updatedBy?: string | null, createdAt: string, updatedAt: string };

export type AdminConfigsQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminConfigsQuery = { __typename?: 'Query', adminConfigs: Array<{ __typename?: 'SystemConfig', id: string, key: string, value: any, remark?: string | null, updatedBy?: string | null, createdAt: string, updatedAt: string }> };

export type BatchUpdateConfigsMutationVariables = Exact<{
  input: BatchUpdateConfigsInput;
}>;


export type BatchUpdateConfigsMutation = { __typename?: 'Mutation', batchUpdateConfigs: Array<{ __typename?: 'SystemConfig', id: string, key: string, value: any, remark?: string | null, updatedBy?: string | null, createdAt: string, updatedAt: string }> };

export type AuditLogFieldsFragment = { __typename?: 'AuditLogItem', id: string, accountId?: string | null, accountUsername?: string | null, action: string, resourceType?: string | null, resourceId?: string | null, detail?: string | null, ip?: string | null, userAgent?: string | null, createdAt: string };

export type AdminLogsQueryVariables = Exact<{
  query: AuditLogQueryInput;
}>;


export type AdminLogsQuery = { __typename?: 'Query', adminLogs: { __typename?: 'PaginatedAuditLogs', total: number, page: number, pageSize: number, items: Array<{ __typename?: 'AuditLogItem', id: string, accountId?: string | null, accountUsername?: string | null, action: string, resourceType?: string | null, resourceId?: string | null, detail?: string | null, ip?: string | null, userAgent?: string | null, createdAt: string }> } };

export type ExportAuditLogsQueryVariables = Exact<{
  query: AuditLogQueryInput;
}>;


export type ExportAuditLogsQuery = { __typename?: 'Query', exportAuditLogs: Array<{ __typename?: 'AuditLogItem', id: string, accountId?: string | null, accountUsername?: string | null, action: string, resourceType?: string | null, resourceId?: string | null, detail?: string | null, ip?: string | null, userAgent?: string | null, createdAt: string }> };

export type ClearAuditLogsMutationVariables = Exact<{ [key: string]: never; }>;


export type ClearAuditLogsMutation = { __typename?: 'Mutation', clearAuditLogs: { __typename?: 'ClearAuditLogsResult', deletedCount: number } };

export type DeleteAuditLogMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteAuditLogMutation = { __typename?: 'Mutation', deleteAuditLog: boolean };

export type CacheKeyFieldsFragment = { __typename?: 'CacheKey', key: string, type: string, ttl: number, value?: string | null, size: number };

export type CacheKeysQueryVariables = Exact<{
  pattern?: InputMaybe<Scalars['String']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type CacheKeysQuery = { __typename?: 'Query', cacheKeys: Array<{ __typename?: 'CacheKey', key: string, type: string, ttl: number, value?: string | null, size: number }> };

export type CacheKeyTotalQueryVariables = Exact<{
  pattern?: InputMaybe<Scalars['String']['input']>;
}>;


export type CacheKeyTotalQuery = { __typename?: 'Query', cacheKeyTotal: number };

export type CacheKeyQueryVariables = Exact<{
  key: Scalars['String']['input'];
}>;


export type CacheKeyQuery = { __typename?: 'Query', cacheKey: { __typename?: 'CacheKey', key: string, type: string, ttl: number, value?: string | null, size: number } };

export type CacheStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type CacheStatsQuery = { __typename?: 'Query', cacheStats: { __typename?: 'CacheStats', usedMemory: string, hitRate: string, uptime: string } };

export type DeleteCacheKeyMutationVariables = Exact<{
  key: Scalars['String']['input'];
}>;


export type DeleteCacheKeyMutation = { __typename?: 'Mutation', deleteCacheKey: boolean };

export type DeleteCacheKeysMutationVariables = Exact<{
  keys: Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;


export type DeleteCacheKeysMutation = { __typename?: 'Mutation', deleteCacheKeys: { __typename?: 'DeleteCacheKeysResult', deletedCount: number, keys: Array<string> } };

export type ClearCacheByPatternMutationVariables = Exact<{
  pattern: Scalars['String']['input'];
}>;


export type ClearCacheByPatternMutation = { __typename?: 'Mutation', clearCacheByPattern: number };

export type StorageConfigQueryVariables = Exact<{ [key: string]: never; }>;


export type StorageConfigQuery = { __typename?: 'Query', storageConfig?: { __typename?: 'SystemConfig', id: string, key: string, value: any, remark?: string | null, updatedBy?: string | null, createdAt: string, updatedAt: string } | null };

export type TurnstileConfigQueryVariables = Exact<{ [key: string]: never; }>;


export type TurnstileConfigQuery = { __typename?: 'Query', turnstileConfig?: { __typename?: 'SystemConfig', id: string, key: string, value: any, remark?: string | null, updatedBy?: string | null, createdAt: string, updatedAt: string } | null };

export type UpdateTurnstileConfigMutationVariables = Exact<{
  input: UpdateConfigInput;
}>;


export type UpdateTurnstileConfigMutation = { __typename?: 'Mutation', updateTurnstileConfig: { __typename?: 'SystemConfig', id: string, key: string, value: any, remark?: string | null, updatedBy?: string | null, createdAt: string, updatedAt: string } };

export type UploadFileFieldsFragment = { __typename?: 'UploadFile', id: string, originalName: string, storedName: string, mimeType: string, size: number, url: string, accountId?: string | null, createdAt: string, deletedAt?: string | null };

export type UploadFilesQueryVariables = Exact<{
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type UploadFilesQuery = { __typename?: 'Query', uploadFiles: { __typename?: 'PaginatedUploadFiles', total: number, page: number, pageSize: number, items: Array<{ __typename?: 'UploadFile', id: string, originalName: string, storedName: string, mimeType: string, size: number, url: string, accountId?: string | null, createdAt: string, deletedAt?: string | null }> } };

export type DeleteUploadFileMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteUploadFileMutation = { __typename?: 'Mutation', deleteUploadFile: { __typename?: 'UploadFile', id: string, deletedAt?: string | null } };

export type PublicConfigsQueryVariables = Exact<{ [key: string]: never; }>;


export type PublicConfigsQuery = { __typename?: 'Query', publicConfigs: Array<{ __typename?: 'SystemConfig', id: string, key: string, value: any, remark?: string | null, updatedBy?: string | null, createdAt: string, updatedAt: string }> };

export const MenuNodeFieldsFragmentDoc = gql`
    fragment MenuNodeFields on AdminMenuNode {
  id
  parentId
  name
  code
  type
  path
  icon
  sort
  enabled
  visible
  createdAt
}
    `;
export const SysDictItemFieldsFragmentDoc = gql`
    fragment SysDictItemFields on SysDictItem {
  id
  label
  value
  remark
  enabled
  sort
  createdAt
  updatedAt
}
    `;
export const SysDictTypeFieldsFragmentDoc = gql`
    fragment SysDictTypeFields on SysDictType {
  id
  code
  name
  remark
  enabled
  sort
  createdAt
  updatedAt
  items {
    ...SysDictItemFields
  }
}
    ${SysDictItemFieldsFragmentDoc}`;
export const SystemConfigFieldsFragmentDoc = gql`
    fragment SystemConfigFields on SystemConfig {
  id
  key
  value
  remark
  updatedBy
  createdAt
  updatedAt
}
    `;
export const AuditLogFieldsFragmentDoc = gql`
    fragment AuditLogFields on AuditLogItem {
  id
  accountId
  accountUsername
  action
  resourceType
  resourceId
  detail
  ip
  userAgent
  createdAt
}
    `;
export const CacheKeyFieldsFragmentDoc = gql`
    fragment CacheKeyFields on CacheKey {
  key
  type
  ttl
  value
  size
}
    `;
export const UploadFileFieldsFragmentDoc = gql`
    fragment UploadFileFields on UploadFile {
  id
  originalName
  storedName
  mimeType
  size
  url
  accountId
  createdAt
  deletedAt
}
    `;
export const AdminAccountsDocument = gql`
    query AdminAccounts($query: AdminAccountQueryInput!) {
  adminAccounts(query: $query) {
    items {
      accountId
      username
      nickname
      email
      avatar
      enabled
      roleCodes
      createdAt
      deletedAt
    }
    total
    page
    pageSize
  }
}
    `;

/**
 * __useAdminAccountsQuery__
 *
 * To run a query within a React component, call `useAdminAccountsQuery` and pass it any options that fit your needs.
 * When your component renders, `useAdminAccountsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAdminAccountsQuery({
 *   variables: {
 *      query: // value for 'query'
 *   },
 * });
 */
export function useAdminAccountsQuery(baseOptions: Apollo.QueryHookOptions<AdminAccountsQuery, AdminAccountsQueryVariables> & ({ variables: AdminAccountsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<AdminAccountsQuery, AdminAccountsQueryVariables>(AdminAccountsDocument, options);
      }
export function useAdminAccountsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<AdminAccountsQuery, AdminAccountsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<AdminAccountsQuery, AdminAccountsQueryVariables>(AdminAccountsDocument, options);
        }
// @ts-ignore
export function useAdminAccountsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<AdminAccountsQuery, AdminAccountsQueryVariables>): Apollo.UseSuspenseQueryResult<AdminAccountsQuery, AdminAccountsQueryVariables>;
export function useAdminAccountsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminAccountsQuery, AdminAccountsQueryVariables>): Apollo.UseSuspenseQueryResult<AdminAccountsQuery | undefined, AdminAccountsQueryVariables>;
export function useAdminAccountsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminAccountsQuery, AdminAccountsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<AdminAccountsQuery, AdminAccountsQueryVariables>(AdminAccountsDocument, options);
        }
export type AdminAccountsQueryHookResult = ReturnType<typeof useAdminAccountsQuery>;
export type AdminAccountsLazyQueryHookResult = ReturnType<typeof useAdminAccountsLazyQuery>;
export type AdminAccountsSuspenseQueryHookResult = ReturnType<typeof useAdminAccountsSuspenseQuery>;
export type AdminAccountsQueryResult = Apollo.QueryResult<AdminAccountsQuery, AdminAccountsQueryVariables>;
export const AdminRolesDocument = gql`
    query AdminRoles {
  adminRoles {
    id
    code
    name
  }
}
    `;

/**
 * __useAdminRolesQuery__
 *
 * To run a query within a React component, call `useAdminRolesQuery` and pass it any options that fit your needs.
 * When your component renders, `useAdminRolesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAdminRolesQuery({
 *   variables: {
 *   },
 * });
 */
export function useAdminRolesQuery(baseOptions?: Apollo.QueryHookOptions<AdminRolesQuery, AdminRolesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<AdminRolesQuery, AdminRolesQueryVariables>(AdminRolesDocument, options);
      }
export function useAdminRolesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<AdminRolesQuery, AdminRolesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<AdminRolesQuery, AdminRolesQueryVariables>(AdminRolesDocument, options);
        }
// @ts-ignore
export function useAdminRolesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<AdminRolesQuery, AdminRolesQueryVariables>): Apollo.UseSuspenseQueryResult<AdminRolesQuery, AdminRolesQueryVariables>;
export function useAdminRolesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminRolesQuery, AdminRolesQueryVariables>): Apollo.UseSuspenseQueryResult<AdminRolesQuery | undefined, AdminRolesQueryVariables>;
export function useAdminRolesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminRolesQuery, AdminRolesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<AdminRolesQuery, AdminRolesQueryVariables>(AdminRolesDocument, options);
        }
export type AdminRolesQueryHookResult = ReturnType<typeof useAdminRolesQuery>;
export type AdminRolesLazyQueryHookResult = ReturnType<typeof useAdminRolesLazyQuery>;
export type AdminRolesSuspenseQueryHookResult = ReturnType<typeof useAdminRolesSuspenseQuery>;
export type AdminRolesQueryResult = Apollo.QueryResult<AdminRolesQuery, AdminRolesQueryVariables>;
export const CreateAdminAccountDocument = gql`
    mutation CreateAdminAccount($input: CreateAdminAccountInput!) {
  createAdminAccount(input: $input) {
    accountId
    username
    nickname
    email
    enabled
    roleCodes
  }
}
    `;
export type CreateAdminAccountMutationFn = Apollo.MutationFunction<CreateAdminAccountMutation, CreateAdminAccountMutationVariables>;

/**
 * __useCreateAdminAccountMutation__
 *
 * To run a mutation, you first call `useCreateAdminAccountMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateAdminAccountMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createAdminAccountMutation, { data, loading, error }] = useCreateAdminAccountMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateAdminAccountMutation(baseOptions?: Apollo.MutationHookOptions<CreateAdminAccountMutation, CreateAdminAccountMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateAdminAccountMutation, CreateAdminAccountMutationVariables>(CreateAdminAccountDocument, options);
      }
export type CreateAdminAccountMutationHookResult = ReturnType<typeof useCreateAdminAccountMutation>;
export type CreateAdminAccountMutationResult = Apollo.MutationResult<CreateAdminAccountMutation>;
export type CreateAdminAccountMutationOptions = Apollo.BaseMutationOptions<CreateAdminAccountMutation, CreateAdminAccountMutationVariables>;
export const UpdateAdminAccountDocument = gql`
    mutation UpdateAdminAccount($id: ID!, $input: UpdateAdminAccountInput!) {
  updateAdminAccount(id: $id, input: $input) {
    accountId
    username
    nickname
    email
    enabled
    roleCodes
  }
}
    `;
export type UpdateAdminAccountMutationFn = Apollo.MutationFunction<UpdateAdminAccountMutation, UpdateAdminAccountMutationVariables>;

/**
 * __useUpdateAdminAccountMutation__
 *
 * To run a mutation, you first call `useUpdateAdminAccountMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateAdminAccountMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateAdminAccountMutation, { data, loading, error }] = useUpdateAdminAccountMutation({
 *   variables: {
 *      id: // value for 'id'
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateAdminAccountMutation(baseOptions?: Apollo.MutationHookOptions<UpdateAdminAccountMutation, UpdateAdminAccountMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateAdminAccountMutation, UpdateAdminAccountMutationVariables>(UpdateAdminAccountDocument, options);
      }
export type UpdateAdminAccountMutationHookResult = ReturnType<typeof useUpdateAdminAccountMutation>;
export type UpdateAdminAccountMutationResult = Apollo.MutationResult<UpdateAdminAccountMutation>;
export type UpdateAdminAccountMutationOptions = Apollo.BaseMutationOptions<UpdateAdminAccountMutation, UpdateAdminAccountMutationVariables>;
export const DeleteAdminAccountDocument = gql`
    mutation DeleteAdminAccount($id: ID!) {
  deleteAdminAccount(id: $id) {
    accountId
  }
}
    `;
export type DeleteAdminAccountMutationFn = Apollo.MutationFunction<DeleteAdminAccountMutation, DeleteAdminAccountMutationVariables>;

/**
 * __useDeleteAdminAccountMutation__
 *
 * To run a mutation, you first call `useDeleteAdminAccountMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteAdminAccountMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteAdminAccountMutation, { data, loading, error }] = useDeleteAdminAccountMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteAdminAccountMutation(baseOptions?: Apollo.MutationHookOptions<DeleteAdminAccountMutation, DeleteAdminAccountMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteAdminAccountMutation, DeleteAdminAccountMutationVariables>(DeleteAdminAccountDocument, options);
      }
export type DeleteAdminAccountMutationHookResult = ReturnType<typeof useDeleteAdminAccountMutation>;
export type DeleteAdminAccountMutationResult = Apollo.MutationResult<DeleteAdminAccountMutation>;
export type DeleteAdminAccountMutationOptions = Apollo.BaseMutationOptions<DeleteAdminAccountMutation, DeleteAdminAccountMutationVariables>;
export const MenuTreeDocument = gql`
    query MenuTree {
  menuTree {
    ...MenuNodeFields
    children {
      ...MenuNodeFields
      children {
        ...MenuNodeFields
        children {
          ...MenuNodeFields
          children {
            ...MenuNodeFields
          }
        }
      }
    }
  }
}
    ${MenuNodeFieldsFragmentDoc}`;

/**
 * __useMenuTreeQuery__
 *
 * To run a query within a React component, call `useMenuTreeQuery` and pass it any options that fit your needs.
 * When your component renders, `useMenuTreeQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMenuTreeQuery({
 *   variables: {
 *   },
 * });
 */
export function useMenuTreeQuery(baseOptions?: Apollo.QueryHookOptions<MenuTreeQuery, MenuTreeQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<MenuTreeQuery, MenuTreeQueryVariables>(MenuTreeDocument, options);
      }
export function useMenuTreeLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<MenuTreeQuery, MenuTreeQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<MenuTreeQuery, MenuTreeQueryVariables>(MenuTreeDocument, options);
        }
// @ts-ignore
export function useMenuTreeSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<MenuTreeQuery, MenuTreeQueryVariables>): Apollo.UseSuspenseQueryResult<MenuTreeQuery, MenuTreeQueryVariables>;
export function useMenuTreeSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MenuTreeQuery, MenuTreeQueryVariables>): Apollo.UseSuspenseQueryResult<MenuTreeQuery | undefined, MenuTreeQueryVariables>;
export function useMenuTreeSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MenuTreeQuery, MenuTreeQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<MenuTreeQuery, MenuTreeQueryVariables>(MenuTreeDocument, options);
        }
export type MenuTreeQueryHookResult = ReturnType<typeof useMenuTreeQuery>;
export type MenuTreeLazyQueryHookResult = ReturnType<typeof useMenuTreeLazyQuery>;
export type MenuTreeSuspenseQueryHookResult = ReturnType<typeof useMenuTreeSuspenseQuery>;
export type MenuTreeQueryResult = Apollo.QueryResult<MenuTreeQuery, MenuTreeQueryVariables>;
export const CreateMenuDocument = gql`
    mutation CreateMenu($input: CreateMenuInput!) {
  createMenu(input: $input) {
    ...MenuNodeFields
  }
}
    ${MenuNodeFieldsFragmentDoc}`;
export type CreateMenuMutationFn = Apollo.MutationFunction<CreateMenuMutation, CreateMenuMutationVariables>;

/**
 * __useCreateMenuMutation__
 *
 * To run a mutation, you first call `useCreateMenuMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateMenuMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createMenuMutation, { data, loading, error }] = useCreateMenuMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateMenuMutation(baseOptions?: Apollo.MutationHookOptions<CreateMenuMutation, CreateMenuMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateMenuMutation, CreateMenuMutationVariables>(CreateMenuDocument, options);
      }
export type CreateMenuMutationHookResult = ReturnType<typeof useCreateMenuMutation>;
export type CreateMenuMutationResult = Apollo.MutationResult<CreateMenuMutation>;
export type CreateMenuMutationOptions = Apollo.BaseMutationOptions<CreateMenuMutation, CreateMenuMutationVariables>;
export const UpdateMenuDocument = gql`
    mutation UpdateMenu($id: ID!, $input: UpdateMenuInput!) {
  updateMenu(id: $id, input: $input) {
    ...MenuNodeFields
  }
}
    ${MenuNodeFieldsFragmentDoc}`;
export type UpdateMenuMutationFn = Apollo.MutationFunction<UpdateMenuMutation, UpdateMenuMutationVariables>;

/**
 * __useUpdateMenuMutation__
 *
 * To run a mutation, you first call `useUpdateMenuMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateMenuMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateMenuMutation, { data, loading, error }] = useUpdateMenuMutation({
 *   variables: {
 *      id: // value for 'id'
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateMenuMutation(baseOptions?: Apollo.MutationHookOptions<UpdateMenuMutation, UpdateMenuMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateMenuMutation, UpdateMenuMutationVariables>(UpdateMenuDocument, options);
      }
export type UpdateMenuMutationHookResult = ReturnType<typeof useUpdateMenuMutation>;
export type UpdateMenuMutationResult = Apollo.MutationResult<UpdateMenuMutation>;
export type UpdateMenuMutationOptions = Apollo.BaseMutationOptions<UpdateMenuMutation, UpdateMenuMutationVariables>;
export const DeleteMenuDocument = gql`
    mutation DeleteMenu($id: ID!) {
  deleteMenu(id: $id) {
    id
  }
}
    `;
export type DeleteMenuMutationFn = Apollo.MutationFunction<DeleteMenuMutation, DeleteMenuMutationVariables>;

/**
 * __useDeleteMenuMutation__
 *
 * To run a mutation, you first call `useDeleteMenuMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteMenuMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteMenuMutation, { data, loading, error }] = useDeleteMenuMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteMenuMutation(baseOptions?: Apollo.MutationHookOptions<DeleteMenuMutation, DeleteMenuMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteMenuMutation, DeleteMenuMutationVariables>(DeleteMenuDocument, options);
      }
export type DeleteMenuMutationHookResult = ReturnType<typeof useDeleteMenuMutation>;
export type DeleteMenuMutationResult = Apollo.MutationResult<DeleteMenuMutation>;
export type DeleteMenuMutationOptions = Apollo.BaseMutationOptions<DeleteMenuMutation, DeleteMenuMutationVariables>;
export const AdminRoleListDocument = gql`
    query AdminRoleList {
  adminRoles {
    id
    name
    code
    description
    enabled
    permissionCodes
    createdAt
  }
}
    `;

/**
 * __useAdminRoleListQuery__
 *
 * To run a query within a React component, call `useAdminRoleListQuery` and pass it any options that fit your needs.
 * When your component renders, `useAdminRoleListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAdminRoleListQuery({
 *   variables: {
 *   },
 * });
 */
export function useAdminRoleListQuery(baseOptions?: Apollo.QueryHookOptions<AdminRoleListQuery, AdminRoleListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<AdminRoleListQuery, AdminRoleListQueryVariables>(AdminRoleListDocument, options);
      }
export function useAdminRoleListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<AdminRoleListQuery, AdminRoleListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<AdminRoleListQuery, AdminRoleListQueryVariables>(AdminRoleListDocument, options);
        }
// @ts-ignore
export function useAdminRoleListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<AdminRoleListQuery, AdminRoleListQueryVariables>): Apollo.UseSuspenseQueryResult<AdminRoleListQuery, AdminRoleListQueryVariables>;
export function useAdminRoleListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminRoleListQuery, AdminRoleListQueryVariables>): Apollo.UseSuspenseQueryResult<AdminRoleListQuery | undefined, AdminRoleListQueryVariables>;
export function useAdminRoleListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminRoleListQuery, AdminRoleListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<AdminRoleListQuery, AdminRoleListQueryVariables>(AdminRoleListDocument, options);
        }
export type AdminRoleListQueryHookResult = ReturnType<typeof useAdminRoleListQuery>;
export type AdminRoleListLazyQueryHookResult = ReturnType<typeof useAdminRoleListLazyQuery>;
export type AdminRoleListSuspenseQueryHookResult = ReturnType<typeof useAdminRoleListSuspenseQuery>;
export type AdminRoleListQueryResult = Apollo.QueryResult<AdminRoleListQuery, AdminRoleListQueryVariables>;
export const PermissionCodeListDocument = gql`
    query PermissionCodeList {
  permissionCodes {
    id
    code
    name
    type
  }
}
    `;

/**
 * __usePermissionCodeListQuery__
 *
 * To run a query within a React component, call `usePermissionCodeListQuery` and pass it any options that fit your needs.
 * When your component renders, `usePermissionCodeListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = usePermissionCodeListQuery({
 *   variables: {
 *   },
 * });
 */
export function usePermissionCodeListQuery(baseOptions?: Apollo.QueryHookOptions<PermissionCodeListQuery, PermissionCodeListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<PermissionCodeListQuery, PermissionCodeListQueryVariables>(PermissionCodeListDocument, options);
      }
export function usePermissionCodeListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<PermissionCodeListQuery, PermissionCodeListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<PermissionCodeListQuery, PermissionCodeListQueryVariables>(PermissionCodeListDocument, options);
        }
// @ts-ignore
export function usePermissionCodeListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<PermissionCodeListQuery, PermissionCodeListQueryVariables>): Apollo.UseSuspenseQueryResult<PermissionCodeListQuery, PermissionCodeListQueryVariables>;
export function usePermissionCodeListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<PermissionCodeListQuery, PermissionCodeListQueryVariables>): Apollo.UseSuspenseQueryResult<PermissionCodeListQuery | undefined, PermissionCodeListQueryVariables>;
export function usePermissionCodeListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<PermissionCodeListQuery, PermissionCodeListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<PermissionCodeListQuery, PermissionCodeListQueryVariables>(PermissionCodeListDocument, options);
        }
export type PermissionCodeListQueryHookResult = ReturnType<typeof usePermissionCodeListQuery>;
export type PermissionCodeListLazyQueryHookResult = ReturnType<typeof usePermissionCodeListLazyQuery>;
export type PermissionCodeListSuspenseQueryHookResult = ReturnType<typeof usePermissionCodeListSuspenseQuery>;
export type PermissionCodeListQueryResult = Apollo.QueryResult<PermissionCodeListQuery, PermissionCodeListQueryVariables>;
export const CreateRoleDocument = gql`
    mutation CreateRole($input: CreateRoleInput!) {
  createRole(input: $input) {
    id
    name
    code
    description
    enabled
    permissionCodes
  }
}
    `;
export type CreateRoleMutationFn = Apollo.MutationFunction<CreateRoleMutation, CreateRoleMutationVariables>;

/**
 * __useCreateRoleMutation__
 *
 * To run a mutation, you first call `useCreateRoleMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateRoleMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createRoleMutation, { data, loading, error }] = useCreateRoleMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateRoleMutation(baseOptions?: Apollo.MutationHookOptions<CreateRoleMutation, CreateRoleMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateRoleMutation, CreateRoleMutationVariables>(CreateRoleDocument, options);
      }
export type CreateRoleMutationHookResult = ReturnType<typeof useCreateRoleMutation>;
export type CreateRoleMutationResult = Apollo.MutationResult<CreateRoleMutation>;
export type CreateRoleMutationOptions = Apollo.BaseMutationOptions<CreateRoleMutation, CreateRoleMutationVariables>;
export const UpdateRoleDocument = gql`
    mutation UpdateRole($id: ID!, $input: UpdateRoleInput!) {
  updateRole(id: $id, input: $input) {
    id
    name
    code
    description
    enabled
    permissionCodes
  }
}
    `;
export type UpdateRoleMutationFn = Apollo.MutationFunction<UpdateRoleMutation, UpdateRoleMutationVariables>;

/**
 * __useUpdateRoleMutation__
 *
 * To run a mutation, you first call `useUpdateRoleMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateRoleMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateRoleMutation, { data, loading, error }] = useUpdateRoleMutation({
 *   variables: {
 *      id: // value for 'id'
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateRoleMutation(baseOptions?: Apollo.MutationHookOptions<UpdateRoleMutation, UpdateRoleMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateRoleMutation, UpdateRoleMutationVariables>(UpdateRoleDocument, options);
      }
export type UpdateRoleMutationHookResult = ReturnType<typeof useUpdateRoleMutation>;
export type UpdateRoleMutationResult = Apollo.MutationResult<UpdateRoleMutation>;
export type UpdateRoleMutationOptions = Apollo.BaseMutationOptions<UpdateRoleMutation, UpdateRoleMutationVariables>;
export const DeleteRoleDocument = gql`
    mutation DeleteRole($id: ID!) {
  deleteRole(id: $id) {
    id
  }
}
    `;
export type DeleteRoleMutationFn = Apollo.MutationFunction<DeleteRoleMutation, DeleteRoleMutationVariables>;

/**
 * __useDeleteRoleMutation__
 *
 * To run a mutation, you first call `useDeleteRoleMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteRoleMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteRoleMutation, { data, loading, error }] = useDeleteRoleMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteRoleMutation(baseOptions?: Apollo.MutationHookOptions<DeleteRoleMutation, DeleteRoleMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteRoleMutation, DeleteRoleMutationVariables>(DeleteRoleDocument, options);
      }
export type DeleteRoleMutationHookResult = ReturnType<typeof useDeleteRoleMutation>;
export type DeleteRoleMutationResult = Apollo.MutationResult<DeleteRoleMutation>;
export type DeleteRoleMutationOptions = Apollo.BaseMutationOptions<DeleteRoleMutation, DeleteRoleMutationVariables>;
export const DashboardAccountsTotalDocument = gql`
    query DashboardAccountsTotal {
  adminAccounts(query: {page: 1, pageSize: 1}) {
    total
  }
}
    `;

/**
 * __useDashboardAccountsTotalQuery__
 *
 * To run a query within a React component, call `useDashboardAccountsTotalQuery` and pass it any options that fit your needs.
 * When your component renders, `useDashboardAccountsTotalQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDashboardAccountsTotalQuery({
 *   variables: {
 *   },
 * });
 */
export function useDashboardAccountsTotalQuery(baseOptions?: Apollo.QueryHookOptions<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>(DashboardAccountsTotalDocument, options);
      }
export function useDashboardAccountsTotalLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>(DashboardAccountsTotalDocument, options);
        }
// @ts-ignore
export function useDashboardAccountsTotalSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>;
export function useDashboardAccountsTotalSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardAccountsTotalQuery | undefined, DashboardAccountsTotalQueryVariables>;
export function useDashboardAccountsTotalSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>(DashboardAccountsTotalDocument, options);
        }
export type DashboardAccountsTotalQueryHookResult = ReturnType<typeof useDashboardAccountsTotalQuery>;
export type DashboardAccountsTotalLazyQueryHookResult = ReturnType<typeof useDashboardAccountsTotalLazyQuery>;
export type DashboardAccountsTotalSuspenseQueryHookResult = ReturnType<typeof useDashboardAccountsTotalSuspenseQuery>;
export type DashboardAccountsTotalQueryResult = Apollo.QueryResult<DashboardAccountsTotalQuery, DashboardAccountsTotalQueryVariables>;
export const DashboardRolesTotalDocument = gql`
    query DashboardRolesTotal {
  adminRoles {
    id
  }
}
    `;

/**
 * __useDashboardRolesTotalQuery__
 *
 * To run a query within a React component, call `useDashboardRolesTotalQuery` and pass it any options that fit your needs.
 * When your component renders, `useDashboardRolesTotalQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDashboardRolesTotalQuery({
 *   variables: {
 *   },
 * });
 */
export function useDashboardRolesTotalQuery(baseOptions?: Apollo.QueryHookOptions<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>(DashboardRolesTotalDocument, options);
      }
export function useDashboardRolesTotalLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>(DashboardRolesTotalDocument, options);
        }
// @ts-ignore
export function useDashboardRolesTotalSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>;
export function useDashboardRolesTotalSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardRolesTotalQuery | undefined, DashboardRolesTotalQueryVariables>;
export function useDashboardRolesTotalSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>(DashboardRolesTotalDocument, options);
        }
export type DashboardRolesTotalQueryHookResult = ReturnType<typeof useDashboardRolesTotalQuery>;
export type DashboardRolesTotalLazyQueryHookResult = ReturnType<typeof useDashboardRolesTotalLazyQuery>;
export type DashboardRolesTotalSuspenseQueryHookResult = ReturnType<typeof useDashboardRolesTotalSuspenseQuery>;
export type DashboardRolesTotalQueryResult = Apollo.QueryResult<DashboardRolesTotalQuery, DashboardRolesTotalQueryVariables>;
export const SysDictTypesDocument = gql`
    query SysDictTypes {
  sysDictTypes {
    ...SysDictTypeFields
  }
}
    ${SysDictTypeFieldsFragmentDoc}`;

/**
 * __useSysDictTypesQuery__
 *
 * To run a query within a React component, call `useSysDictTypesQuery` and pass it any options that fit your needs.
 * When your component renders, `useSysDictTypesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSysDictTypesQuery({
 *   variables: {
 *   },
 * });
 */
export function useSysDictTypesQuery(baseOptions?: Apollo.QueryHookOptions<SysDictTypesQuery, SysDictTypesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<SysDictTypesQuery, SysDictTypesQueryVariables>(SysDictTypesDocument, options);
      }
export function useSysDictTypesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<SysDictTypesQuery, SysDictTypesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<SysDictTypesQuery, SysDictTypesQueryVariables>(SysDictTypesDocument, options);
        }
// @ts-ignore
export function useSysDictTypesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<SysDictTypesQuery, SysDictTypesQueryVariables>): Apollo.UseSuspenseQueryResult<SysDictTypesQuery, SysDictTypesQueryVariables>;
export function useSysDictTypesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<SysDictTypesQuery, SysDictTypesQueryVariables>): Apollo.UseSuspenseQueryResult<SysDictTypesQuery | undefined, SysDictTypesQueryVariables>;
export function useSysDictTypesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<SysDictTypesQuery, SysDictTypesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<SysDictTypesQuery, SysDictTypesQueryVariables>(SysDictTypesDocument, options);
        }
export type SysDictTypesQueryHookResult = ReturnType<typeof useSysDictTypesQuery>;
export type SysDictTypesLazyQueryHookResult = ReturnType<typeof useSysDictTypesLazyQuery>;
export type SysDictTypesSuspenseQueryHookResult = ReturnType<typeof useSysDictTypesSuspenseQuery>;
export type SysDictTypesQueryResult = Apollo.QueryResult<SysDictTypesQuery, SysDictTypesQueryVariables>;
export const CreateDictTypeDocument = gql`
    mutation CreateDictType($input: CreateDictTypeInput!) {
  createDictType(input: $input) {
    ...SysDictTypeFields
  }
}
    ${SysDictTypeFieldsFragmentDoc}`;
export type CreateDictTypeMutationFn = Apollo.MutationFunction<CreateDictTypeMutation, CreateDictTypeMutationVariables>;

/**
 * __useCreateDictTypeMutation__
 *
 * To run a mutation, you first call `useCreateDictTypeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateDictTypeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createDictTypeMutation, { data, loading, error }] = useCreateDictTypeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateDictTypeMutation(baseOptions?: Apollo.MutationHookOptions<CreateDictTypeMutation, CreateDictTypeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateDictTypeMutation, CreateDictTypeMutationVariables>(CreateDictTypeDocument, options);
      }
export type CreateDictTypeMutationHookResult = ReturnType<typeof useCreateDictTypeMutation>;
export type CreateDictTypeMutationResult = Apollo.MutationResult<CreateDictTypeMutation>;
export type CreateDictTypeMutationOptions = Apollo.BaseMutationOptions<CreateDictTypeMutation, CreateDictTypeMutationVariables>;
export const UpdateDictTypeDocument = gql`
    mutation UpdateDictType($id: ID!, $input: UpdateDictTypeInput!) {
  updateDictType(id: $id, input: $input) {
    ...SysDictTypeFields
  }
}
    ${SysDictTypeFieldsFragmentDoc}`;
export type UpdateDictTypeMutationFn = Apollo.MutationFunction<UpdateDictTypeMutation, UpdateDictTypeMutationVariables>;

/**
 * __useUpdateDictTypeMutation__
 *
 * To run a mutation, you first call `useUpdateDictTypeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateDictTypeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateDictTypeMutation, { data, loading, error }] = useUpdateDictTypeMutation({
 *   variables: {
 *      id: // value for 'id'
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateDictTypeMutation(baseOptions?: Apollo.MutationHookOptions<UpdateDictTypeMutation, UpdateDictTypeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateDictTypeMutation, UpdateDictTypeMutationVariables>(UpdateDictTypeDocument, options);
      }
export type UpdateDictTypeMutationHookResult = ReturnType<typeof useUpdateDictTypeMutation>;
export type UpdateDictTypeMutationResult = Apollo.MutationResult<UpdateDictTypeMutation>;
export type UpdateDictTypeMutationOptions = Apollo.BaseMutationOptions<UpdateDictTypeMutation, UpdateDictTypeMutationVariables>;
export const DeleteDictTypeDocument = gql`
    mutation DeleteDictType($id: ID!) {
  deleteDictType(id: $id)
}
    `;
export type DeleteDictTypeMutationFn = Apollo.MutationFunction<DeleteDictTypeMutation, DeleteDictTypeMutationVariables>;

/**
 * __useDeleteDictTypeMutation__
 *
 * To run a mutation, you first call `useDeleteDictTypeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteDictTypeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteDictTypeMutation, { data, loading, error }] = useDeleteDictTypeMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteDictTypeMutation(baseOptions?: Apollo.MutationHookOptions<DeleteDictTypeMutation, DeleteDictTypeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteDictTypeMutation, DeleteDictTypeMutationVariables>(DeleteDictTypeDocument, options);
      }
export type DeleteDictTypeMutationHookResult = ReturnType<typeof useDeleteDictTypeMutation>;
export type DeleteDictTypeMutationResult = Apollo.MutationResult<DeleteDictTypeMutation>;
export type DeleteDictTypeMutationOptions = Apollo.BaseMutationOptions<DeleteDictTypeMutation, DeleteDictTypeMutationVariables>;
export const CreateDictItemDocument = gql`
    mutation CreateDictItem($input: CreateDictItemInput!) {
  createDictItem(input: $input) {
    ...SysDictItemFields
  }
}
    ${SysDictItemFieldsFragmentDoc}`;
export type CreateDictItemMutationFn = Apollo.MutationFunction<CreateDictItemMutation, CreateDictItemMutationVariables>;

/**
 * __useCreateDictItemMutation__
 *
 * To run a mutation, you first call `useCreateDictItemMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateDictItemMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createDictItemMutation, { data, loading, error }] = useCreateDictItemMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateDictItemMutation(baseOptions?: Apollo.MutationHookOptions<CreateDictItemMutation, CreateDictItemMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateDictItemMutation, CreateDictItemMutationVariables>(CreateDictItemDocument, options);
      }
export type CreateDictItemMutationHookResult = ReturnType<typeof useCreateDictItemMutation>;
export type CreateDictItemMutationResult = Apollo.MutationResult<CreateDictItemMutation>;
export type CreateDictItemMutationOptions = Apollo.BaseMutationOptions<CreateDictItemMutation, CreateDictItemMutationVariables>;
export const UpdateDictItemDocument = gql`
    mutation UpdateDictItem($id: ID!, $input: UpdateDictItemInput!) {
  updateDictItem(id: $id, input: $input) {
    ...SysDictItemFields
  }
}
    ${SysDictItemFieldsFragmentDoc}`;
export type UpdateDictItemMutationFn = Apollo.MutationFunction<UpdateDictItemMutation, UpdateDictItemMutationVariables>;

/**
 * __useUpdateDictItemMutation__
 *
 * To run a mutation, you first call `useUpdateDictItemMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateDictItemMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateDictItemMutation, { data, loading, error }] = useUpdateDictItemMutation({
 *   variables: {
 *      id: // value for 'id'
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateDictItemMutation(baseOptions?: Apollo.MutationHookOptions<UpdateDictItemMutation, UpdateDictItemMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateDictItemMutation, UpdateDictItemMutationVariables>(UpdateDictItemDocument, options);
      }
export type UpdateDictItemMutationHookResult = ReturnType<typeof useUpdateDictItemMutation>;
export type UpdateDictItemMutationResult = Apollo.MutationResult<UpdateDictItemMutation>;
export type UpdateDictItemMutationOptions = Apollo.BaseMutationOptions<UpdateDictItemMutation, UpdateDictItemMutationVariables>;
export const DeleteDictItemDocument = gql`
    mutation DeleteDictItem($id: ID!) {
  deleteDictItem(id: $id)
}
    `;
export type DeleteDictItemMutationFn = Apollo.MutationFunction<DeleteDictItemMutation, DeleteDictItemMutationVariables>;

/**
 * __useDeleteDictItemMutation__
 *
 * To run a mutation, you first call `useDeleteDictItemMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteDictItemMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteDictItemMutation, { data, loading, error }] = useDeleteDictItemMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteDictItemMutation(baseOptions?: Apollo.MutationHookOptions<DeleteDictItemMutation, DeleteDictItemMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteDictItemMutation, DeleteDictItemMutationVariables>(DeleteDictItemDocument, options);
      }
export type DeleteDictItemMutationHookResult = ReturnType<typeof useDeleteDictItemMutation>;
export type DeleteDictItemMutationResult = Apollo.MutationResult<DeleteDictItemMutation>;
export type DeleteDictItemMutationOptions = Apollo.BaseMutationOptions<DeleteDictItemMutation, DeleteDictItemMutationVariables>;
export const AdminConfigsDocument = gql`
    query AdminConfigs {
  adminConfigs {
    ...SystemConfigFields
  }
}
    ${SystemConfigFieldsFragmentDoc}`;

/**
 * __useAdminConfigsQuery__
 *
 * To run a query within a React component, call `useAdminConfigsQuery` and pass it any options that fit your needs.
 * When your component renders, `useAdminConfigsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAdminConfigsQuery({
 *   variables: {
 *   },
 * });
 */
export function useAdminConfigsQuery(baseOptions?: Apollo.QueryHookOptions<AdminConfigsQuery, AdminConfigsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<AdminConfigsQuery, AdminConfigsQueryVariables>(AdminConfigsDocument, options);
      }
export function useAdminConfigsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<AdminConfigsQuery, AdminConfigsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<AdminConfigsQuery, AdminConfigsQueryVariables>(AdminConfigsDocument, options);
        }
// @ts-ignore
export function useAdminConfigsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<AdminConfigsQuery, AdminConfigsQueryVariables>): Apollo.UseSuspenseQueryResult<AdminConfigsQuery, AdminConfigsQueryVariables>;
export function useAdminConfigsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminConfigsQuery, AdminConfigsQueryVariables>): Apollo.UseSuspenseQueryResult<AdminConfigsQuery | undefined, AdminConfigsQueryVariables>;
export function useAdminConfigsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminConfigsQuery, AdminConfigsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<AdminConfigsQuery, AdminConfigsQueryVariables>(AdminConfigsDocument, options);
        }
export type AdminConfigsQueryHookResult = ReturnType<typeof useAdminConfigsQuery>;
export type AdminConfigsLazyQueryHookResult = ReturnType<typeof useAdminConfigsLazyQuery>;
export type AdminConfigsSuspenseQueryHookResult = ReturnType<typeof useAdminConfigsSuspenseQuery>;
export type AdminConfigsQueryResult = Apollo.QueryResult<AdminConfigsQuery, AdminConfigsQueryVariables>;
export const BatchUpdateConfigsDocument = gql`
    mutation BatchUpdateConfigs($input: BatchUpdateConfigsInput!) {
  batchUpdateConfigs(input: $input) {
    ...SystemConfigFields
  }
}
    ${SystemConfigFieldsFragmentDoc}`;
export type BatchUpdateConfigsMutationFn = Apollo.MutationFunction<BatchUpdateConfigsMutation, BatchUpdateConfigsMutationVariables>;

/**
 * __useBatchUpdateConfigsMutation__
 *
 * To run a mutation, you first call `useBatchUpdateConfigsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useBatchUpdateConfigsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [batchUpdateConfigsMutation, { data, loading, error }] = useBatchUpdateConfigsMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useBatchUpdateConfigsMutation(baseOptions?: Apollo.MutationHookOptions<BatchUpdateConfigsMutation, BatchUpdateConfigsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<BatchUpdateConfigsMutation, BatchUpdateConfigsMutationVariables>(BatchUpdateConfigsDocument, options);
      }
export type BatchUpdateConfigsMutationHookResult = ReturnType<typeof useBatchUpdateConfigsMutation>;
export type BatchUpdateConfigsMutationResult = Apollo.MutationResult<BatchUpdateConfigsMutation>;
export type BatchUpdateConfigsMutationOptions = Apollo.BaseMutationOptions<BatchUpdateConfigsMutation, BatchUpdateConfigsMutationVariables>;
export const AdminLogsDocument = gql`
    query AdminLogs($query: AuditLogQueryInput!) {
  adminLogs(query: $query) {
    items {
      ...AuditLogFields
    }
    total
    page
    pageSize
  }
}
    ${AuditLogFieldsFragmentDoc}`;

/**
 * __useAdminLogsQuery__
 *
 * To run a query within a React component, call `useAdminLogsQuery` and pass it any options that fit your needs.
 * When your component renders, `useAdminLogsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAdminLogsQuery({
 *   variables: {
 *      query: // value for 'query'
 *   },
 * });
 */
export function useAdminLogsQuery(baseOptions: Apollo.QueryHookOptions<AdminLogsQuery, AdminLogsQueryVariables> & ({ variables: AdminLogsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<AdminLogsQuery, AdminLogsQueryVariables>(AdminLogsDocument, options);
      }
export function useAdminLogsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<AdminLogsQuery, AdminLogsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<AdminLogsQuery, AdminLogsQueryVariables>(AdminLogsDocument, options);
        }
// @ts-ignore
export function useAdminLogsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<AdminLogsQuery, AdminLogsQueryVariables>): Apollo.UseSuspenseQueryResult<AdminLogsQuery, AdminLogsQueryVariables>;
export function useAdminLogsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminLogsQuery, AdminLogsQueryVariables>): Apollo.UseSuspenseQueryResult<AdminLogsQuery | undefined, AdminLogsQueryVariables>;
export function useAdminLogsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AdminLogsQuery, AdminLogsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<AdminLogsQuery, AdminLogsQueryVariables>(AdminLogsDocument, options);
        }
export type AdminLogsQueryHookResult = ReturnType<typeof useAdminLogsQuery>;
export type AdminLogsLazyQueryHookResult = ReturnType<typeof useAdminLogsLazyQuery>;
export type AdminLogsSuspenseQueryHookResult = ReturnType<typeof useAdminLogsSuspenseQuery>;
export type AdminLogsQueryResult = Apollo.QueryResult<AdminLogsQuery, AdminLogsQueryVariables>;
export const ExportAuditLogsDocument = gql`
    query ExportAuditLogs($query: AuditLogQueryInput!) {
  exportAuditLogs(query: $query) {
    ...AuditLogFields
  }
}
    ${AuditLogFieldsFragmentDoc}`;

/**
 * __useExportAuditLogsQuery__
 *
 * To run a query within a React component, call `useExportAuditLogsQuery` and pass it any options that fit your needs.
 * When your component renders, `useExportAuditLogsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useExportAuditLogsQuery({
 *   variables: {
 *      query: // value for 'query'
 *   },
 * });
 */
export function useExportAuditLogsQuery(baseOptions: Apollo.QueryHookOptions<ExportAuditLogsQuery, ExportAuditLogsQueryVariables> & ({ variables: ExportAuditLogsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>(ExportAuditLogsDocument, options);
      }
export function useExportAuditLogsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>(ExportAuditLogsDocument, options);
        }
// @ts-ignore
export function useExportAuditLogsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>): Apollo.UseSuspenseQueryResult<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>;
export function useExportAuditLogsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>): Apollo.UseSuspenseQueryResult<ExportAuditLogsQuery | undefined, ExportAuditLogsQueryVariables>;
export function useExportAuditLogsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>(ExportAuditLogsDocument, options);
        }
export type ExportAuditLogsQueryHookResult = ReturnType<typeof useExportAuditLogsQuery>;
export type ExportAuditLogsLazyQueryHookResult = ReturnType<typeof useExportAuditLogsLazyQuery>;
export type ExportAuditLogsSuspenseQueryHookResult = ReturnType<typeof useExportAuditLogsSuspenseQuery>;
export type ExportAuditLogsQueryResult = Apollo.QueryResult<ExportAuditLogsQuery, ExportAuditLogsQueryVariables>;
export const ClearAuditLogsDocument = gql`
    mutation ClearAuditLogs {
  clearAuditLogs {
    deletedCount
  }
}
    `;
export type ClearAuditLogsMutationFn = Apollo.MutationFunction<ClearAuditLogsMutation, ClearAuditLogsMutationVariables>;

/**
 * __useClearAuditLogsMutation__
 *
 * To run a mutation, you first call `useClearAuditLogsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useClearAuditLogsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [clearAuditLogsMutation, { data, loading, error }] = useClearAuditLogsMutation({
 *   variables: {
 *   },
 * });
 */
export function useClearAuditLogsMutation(baseOptions?: Apollo.MutationHookOptions<ClearAuditLogsMutation, ClearAuditLogsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ClearAuditLogsMutation, ClearAuditLogsMutationVariables>(ClearAuditLogsDocument, options);
      }
export type ClearAuditLogsMutationHookResult = ReturnType<typeof useClearAuditLogsMutation>;
export type ClearAuditLogsMutationResult = Apollo.MutationResult<ClearAuditLogsMutation>;
export type ClearAuditLogsMutationOptions = Apollo.BaseMutationOptions<ClearAuditLogsMutation, ClearAuditLogsMutationVariables>;
export const DeleteAuditLogDocument = gql`
    mutation DeleteAuditLog($id: ID!) {
  deleteAuditLog(id: $id)
}
    `;
export type DeleteAuditLogMutationFn = Apollo.MutationFunction<DeleteAuditLogMutation, DeleteAuditLogMutationVariables>;

/**
 * __useDeleteAuditLogMutation__
 *
 * To run a mutation, you first call `useDeleteAuditLogMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteAuditLogMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteAuditLogMutation, { data, loading, error }] = useDeleteAuditLogMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteAuditLogMutation(baseOptions?: Apollo.MutationHookOptions<DeleteAuditLogMutation, DeleteAuditLogMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteAuditLogMutation, DeleteAuditLogMutationVariables>(DeleteAuditLogDocument, options);
      }
export type DeleteAuditLogMutationHookResult = ReturnType<typeof useDeleteAuditLogMutation>;
export type DeleteAuditLogMutationResult = Apollo.MutationResult<DeleteAuditLogMutation>;
export type DeleteAuditLogMutationOptions = Apollo.BaseMutationOptions<DeleteAuditLogMutation, DeleteAuditLogMutationVariables>;
export const CacheKeysDocument = gql`
    query CacheKeys($pattern: String, $offset: Int, $limit: Int) {
  cacheKeys(pattern: $pattern, offset: $offset, limit: $limit) {
    ...CacheKeyFields
  }
}
    ${CacheKeyFieldsFragmentDoc}`;

/**
 * __useCacheKeysQuery__
 *
 * To run a query within a React component, call `useCacheKeysQuery` and pass it any options that fit your needs.
 * When your component renders, `useCacheKeysQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCacheKeysQuery({
 *   variables: {
 *      pattern: // value for 'pattern'
 *      offset: // value for 'offset'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useCacheKeysQuery(baseOptions?: Apollo.QueryHookOptions<CacheKeysQuery, CacheKeysQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<CacheKeysQuery, CacheKeysQueryVariables>(CacheKeysDocument, options);
      }
export function useCacheKeysLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<CacheKeysQuery, CacheKeysQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<CacheKeysQuery, CacheKeysQueryVariables>(CacheKeysDocument, options);
        }
// @ts-ignore
export function useCacheKeysSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<CacheKeysQuery, CacheKeysQueryVariables>): Apollo.UseSuspenseQueryResult<CacheKeysQuery, CacheKeysQueryVariables>;
export function useCacheKeysSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CacheKeysQuery, CacheKeysQueryVariables>): Apollo.UseSuspenseQueryResult<CacheKeysQuery | undefined, CacheKeysQueryVariables>;
export function useCacheKeysSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CacheKeysQuery, CacheKeysQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<CacheKeysQuery, CacheKeysQueryVariables>(CacheKeysDocument, options);
        }
export type CacheKeysQueryHookResult = ReturnType<typeof useCacheKeysQuery>;
export type CacheKeysLazyQueryHookResult = ReturnType<typeof useCacheKeysLazyQuery>;
export type CacheKeysSuspenseQueryHookResult = ReturnType<typeof useCacheKeysSuspenseQuery>;
export type CacheKeysQueryResult = Apollo.QueryResult<CacheKeysQuery, CacheKeysQueryVariables>;
export const CacheKeyTotalDocument = gql`
    query CacheKeyTotal($pattern: String) {
  cacheKeyTotal(pattern: $pattern)
}
    `;

/**
 * __useCacheKeyTotalQuery__
 *
 * To run a query within a React component, call `useCacheKeyTotalQuery` and pass it any options that fit your needs.
 * When your component renders, `useCacheKeyTotalQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCacheKeyTotalQuery({
 *   variables: {
 *      pattern: // value for 'pattern'
 *   },
 * });
 */
export function useCacheKeyTotalQuery(baseOptions?: Apollo.QueryHookOptions<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>(CacheKeyTotalDocument, options);
      }
export function useCacheKeyTotalLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>(CacheKeyTotalDocument, options);
        }
// @ts-ignore
export function useCacheKeyTotalSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>): Apollo.UseSuspenseQueryResult<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>;
export function useCacheKeyTotalSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>): Apollo.UseSuspenseQueryResult<CacheKeyTotalQuery | undefined, CacheKeyTotalQueryVariables>;
export function useCacheKeyTotalSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>(CacheKeyTotalDocument, options);
        }
export type CacheKeyTotalQueryHookResult = ReturnType<typeof useCacheKeyTotalQuery>;
export type CacheKeyTotalLazyQueryHookResult = ReturnType<typeof useCacheKeyTotalLazyQuery>;
export type CacheKeyTotalSuspenseQueryHookResult = ReturnType<typeof useCacheKeyTotalSuspenseQuery>;
export type CacheKeyTotalQueryResult = Apollo.QueryResult<CacheKeyTotalQuery, CacheKeyTotalQueryVariables>;
export const CacheKeyDocument = gql`
    query CacheKey($key: String!) {
  cacheKey(key: $key) {
    ...CacheKeyFields
  }
}
    ${CacheKeyFieldsFragmentDoc}`;

/**
 * __useCacheKeyQuery__
 *
 * To run a query within a React component, call `useCacheKeyQuery` and pass it any options that fit your needs.
 * When your component renders, `useCacheKeyQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCacheKeyQuery({
 *   variables: {
 *      key: // value for 'key'
 *   },
 * });
 */
export function useCacheKeyQuery(baseOptions: Apollo.QueryHookOptions<CacheKeyQuery, CacheKeyQueryVariables> & ({ variables: CacheKeyQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<CacheKeyQuery, CacheKeyQueryVariables>(CacheKeyDocument, options);
      }
export function useCacheKeyLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<CacheKeyQuery, CacheKeyQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<CacheKeyQuery, CacheKeyQueryVariables>(CacheKeyDocument, options);
        }
// @ts-ignore
export function useCacheKeySuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<CacheKeyQuery, CacheKeyQueryVariables>): Apollo.UseSuspenseQueryResult<CacheKeyQuery, CacheKeyQueryVariables>;
export function useCacheKeySuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CacheKeyQuery, CacheKeyQueryVariables>): Apollo.UseSuspenseQueryResult<CacheKeyQuery | undefined, CacheKeyQueryVariables>;
export function useCacheKeySuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CacheKeyQuery, CacheKeyQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<CacheKeyQuery, CacheKeyQueryVariables>(CacheKeyDocument, options);
        }
export type CacheKeyQueryHookResult = ReturnType<typeof useCacheKeyQuery>;
export type CacheKeyLazyQueryHookResult = ReturnType<typeof useCacheKeyLazyQuery>;
export type CacheKeySuspenseQueryHookResult = ReturnType<typeof useCacheKeySuspenseQuery>;
export type CacheKeyQueryResult = Apollo.QueryResult<CacheKeyQuery, CacheKeyQueryVariables>;
export const CacheStatsDocument = gql`
    query CacheStats {
  cacheStats {
    usedMemory
    hitRate
    uptime
  }
}
    `;

/**
 * __useCacheStatsQuery__
 *
 * To run a query within a React component, call `useCacheStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useCacheStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCacheStatsQuery({
 *   variables: {
 *   },
 * });
 */
export function useCacheStatsQuery(baseOptions?: Apollo.QueryHookOptions<CacheStatsQuery, CacheStatsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<CacheStatsQuery, CacheStatsQueryVariables>(CacheStatsDocument, options);
      }
export function useCacheStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<CacheStatsQuery, CacheStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<CacheStatsQuery, CacheStatsQueryVariables>(CacheStatsDocument, options);
        }
// @ts-ignore
export function useCacheStatsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<CacheStatsQuery, CacheStatsQueryVariables>): Apollo.UseSuspenseQueryResult<CacheStatsQuery, CacheStatsQueryVariables>;
export function useCacheStatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CacheStatsQuery, CacheStatsQueryVariables>): Apollo.UseSuspenseQueryResult<CacheStatsQuery | undefined, CacheStatsQueryVariables>;
export function useCacheStatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CacheStatsQuery, CacheStatsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<CacheStatsQuery, CacheStatsQueryVariables>(CacheStatsDocument, options);
        }
export type CacheStatsQueryHookResult = ReturnType<typeof useCacheStatsQuery>;
export type CacheStatsLazyQueryHookResult = ReturnType<typeof useCacheStatsLazyQuery>;
export type CacheStatsSuspenseQueryHookResult = ReturnType<typeof useCacheStatsSuspenseQuery>;
export type CacheStatsQueryResult = Apollo.QueryResult<CacheStatsQuery, CacheStatsQueryVariables>;
export const DeleteCacheKeyDocument = gql`
    mutation DeleteCacheKey($key: String!) {
  deleteCacheKey(key: $key)
}
    `;
export type DeleteCacheKeyMutationFn = Apollo.MutationFunction<DeleteCacheKeyMutation, DeleteCacheKeyMutationVariables>;

/**
 * __useDeleteCacheKeyMutation__
 *
 * To run a mutation, you first call `useDeleteCacheKeyMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteCacheKeyMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteCacheKeyMutation, { data, loading, error }] = useDeleteCacheKeyMutation({
 *   variables: {
 *      key: // value for 'key'
 *   },
 * });
 */
export function useDeleteCacheKeyMutation(baseOptions?: Apollo.MutationHookOptions<DeleteCacheKeyMutation, DeleteCacheKeyMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteCacheKeyMutation, DeleteCacheKeyMutationVariables>(DeleteCacheKeyDocument, options);
      }
export type DeleteCacheKeyMutationHookResult = ReturnType<typeof useDeleteCacheKeyMutation>;
export type DeleteCacheKeyMutationResult = Apollo.MutationResult<DeleteCacheKeyMutation>;
export type DeleteCacheKeyMutationOptions = Apollo.BaseMutationOptions<DeleteCacheKeyMutation, DeleteCacheKeyMutationVariables>;
export const DeleteCacheKeysDocument = gql`
    mutation DeleteCacheKeys($keys: [String!]!) {
  deleteCacheKeys(keys: $keys) {
    deletedCount
    keys
  }
}
    `;
export type DeleteCacheKeysMutationFn = Apollo.MutationFunction<DeleteCacheKeysMutation, DeleteCacheKeysMutationVariables>;

/**
 * __useDeleteCacheKeysMutation__
 *
 * To run a mutation, you first call `useDeleteCacheKeysMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteCacheKeysMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteCacheKeysMutation, { data, loading, error }] = useDeleteCacheKeysMutation({
 *   variables: {
 *      keys: // value for 'keys'
 *   },
 * });
 */
export function useDeleteCacheKeysMutation(baseOptions?: Apollo.MutationHookOptions<DeleteCacheKeysMutation, DeleteCacheKeysMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteCacheKeysMutation, DeleteCacheKeysMutationVariables>(DeleteCacheKeysDocument, options);
      }
export type DeleteCacheKeysMutationHookResult = ReturnType<typeof useDeleteCacheKeysMutation>;
export type DeleteCacheKeysMutationResult = Apollo.MutationResult<DeleteCacheKeysMutation>;
export type DeleteCacheKeysMutationOptions = Apollo.BaseMutationOptions<DeleteCacheKeysMutation, DeleteCacheKeysMutationVariables>;
export const ClearCacheByPatternDocument = gql`
    mutation ClearCacheByPattern($pattern: String!) {
  clearCacheByPattern(pattern: $pattern)
}
    `;
export type ClearCacheByPatternMutationFn = Apollo.MutationFunction<ClearCacheByPatternMutation, ClearCacheByPatternMutationVariables>;

/**
 * __useClearCacheByPatternMutation__
 *
 * To run a mutation, you first call `useClearCacheByPatternMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useClearCacheByPatternMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [clearCacheByPatternMutation, { data, loading, error }] = useClearCacheByPatternMutation({
 *   variables: {
 *      pattern: // value for 'pattern'
 *   },
 * });
 */
export function useClearCacheByPatternMutation(baseOptions?: Apollo.MutationHookOptions<ClearCacheByPatternMutation, ClearCacheByPatternMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ClearCacheByPatternMutation, ClearCacheByPatternMutationVariables>(ClearCacheByPatternDocument, options);
      }
export type ClearCacheByPatternMutationHookResult = ReturnType<typeof useClearCacheByPatternMutation>;
export type ClearCacheByPatternMutationResult = Apollo.MutationResult<ClearCacheByPatternMutation>;
export type ClearCacheByPatternMutationOptions = Apollo.BaseMutationOptions<ClearCacheByPatternMutation, ClearCacheByPatternMutationVariables>;
export const StorageConfigDocument = gql`
    query StorageConfig {
  storageConfig {
    ...SystemConfigFields
  }
}
    ${SystemConfigFieldsFragmentDoc}`;

/**
 * __useStorageConfigQuery__
 *
 * To run a query within a React component, call `useStorageConfigQuery` and pass it any options that fit your needs.
 * When your component renders, `useStorageConfigQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useStorageConfigQuery({
 *   variables: {
 *   },
 * });
 */
export function useStorageConfigQuery(baseOptions?: Apollo.QueryHookOptions<StorageConfigQuery, StorageConfigQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<StorageConfigQuery, StorageConfigQueryVariables>(StorageConfigDocument, options);
      }
export function useStorageConfigLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<StorageConfigQuery, StorageConfigQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<StorageConfigQuery, StorageConfigQueryVariables>(StorageConfigDocument, options);
        }
// @ts-ignore
export function useStorageConfigSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<StorageConfigQuery, StorageConfigQueryVariables>): Apollo.UseSuspenseQueryResult<StorageConfigQuery, StorageConfigQueryVariables>;
export function useStorageConfigSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<StorageConfigQuery, StorageConfigQueryVariables>): Apollo.UseSuspenseQueryResult<StorageConfigQuery | undefined, StorageConfigQueryVariables>;
export function useStorageConfigSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<StorageConfigQuery, StorageConfigQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<StorageConfigQuery, StorageConfigQueryVariables>(StorageConfigDocument, options);
        }
export type StorageConfigQueryHookResult = ReturnType<typeof useStorageConfigQuery>;
export type StorageConfigLazyQueryHookResult = ReturnType<typeof useStorageConfigLazyQuery>;
export type StorageConfigSuspenseQueryHookResult = ReturnType<typeof useStorageConfigSuspenseQuery>;
export type StorageConfigQueryResult = Apollo.QueryResult<StorageConfigQuery, StorageConfigQueryVariables>;
export const TurnstileConfigDocument = gql`
    query TurnstileConfig {
  turnstileConfig {
    ...SystemConfigFields
  }
}
    ${SystemConfigFieldsFragmentDoc}`;

/**
 * __useTurnstileConfigQuery__
 *
 * To run a query within a React component, call `useTurnstileConfigQuery` and pass it any options that fit your needs.
 * When your component renders, `useTurnstileConfigQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTurnstileConfigQuery({
 *   variables: {
 *   },
 * });
 */
export function useTurnstileConfigQuery(baseOptions?: Apollo.QueryHookOptions<TurnstileConfigQuery, TurnstileConfigQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<TurnstileConfigQuery, TurnstileConfigQueryVariables>(TurnstileConfigDocument, options);
      }
export function useTurnstileConfigLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<TurnstileConfigQuery, TurnstileConfigQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<TurnstileConfigQuery, TurnstileConfigQueryVariables>(TurnstileConfigDocument, options);
        }
// @ts-ignore
export function useTurnstileConfigSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<TurnstileConfigQuery, TurnstileConfigQueryVariables>): Apollo.UseSuspenseQueryResult<TurnstileConfigQuery, TurnstileConfigQueryVariables>;
export function useTurnstileConfigSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<TurnstileConfigQuery, TurnstileConfigQueryVariables>): Apollo.UseSuspenseQueryResult<TurnstileConfigQuery | undefined, TurnstileConfigQueryVariables>;
export function useTurnstileConfigSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<TurnstileConfigQuery, TurnstileConfigQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<TurnstileConfigQuery, TurnstileConfigQueryVariables>(TurnstileConfigDocument, options);
        }
export type TurnstileConfigQueryHookResult = ReturnType<typeof useTurnstileConfigQuery>;
export type TurnstileConfigLazyQueryHookResult = ReturnType<typeof useTurnstileConfigLazyQuery>;
export type TurnstileConfigSuspenseQueryHookResult = ReturnType<typeof useTurnstileConfigSuspenseQuery>;
export type TurnstileConfigQueryResult = Apollo.QueryResult<TurnstileConfigQuery, TurnstileConfigQueryVariables>;
export const UpdateTurnstileConfigDocument = gql`
    mutation UpdateTurnstileConfig($input: UpdateConfigInput!) {
  updateTurnstileConfig(input: $input) {
    ...SystemConfigFields
  }
}
    ${SystemConfigFieldsFragmentDoc}`;
export type UpdateTurnstileConfigMutationFn = Apollo.MutationFunction<UpdateTurnstileConfigMutation, UpdateTurnstileConfigMutationVariables>;

/**
 * __useUpdateTurnstileConfigMutation__
 *
 * To run a mutation, you first call `useUpdateTurnstileConfigMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateTurnstileConfigMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateTurnstileConfigMutation, { data, loading, error }] = useUpdateTurnstileConfigMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateTurnstileConfigMutation(baseOptions?: Apollo.MutationHookOptions<UpdateTurnstileConfigMutation, UpdateTurnstileConfigMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateTurnstileConfigMutation, UpdateTurnstileConfigMutationVariables>(UpdateTurnstileConfigDocument, options);
      }
export type UpdateTurnstileConfigMutationHookResult = ReturnType<typeof useUpdateTurnstileConfigMutation>;
export type UpdateTurnstileConfigMutationResult = Apollo.MutationResult<UpdateTurnstileConfigMutation>;
export type UpdateTurnstileConfigMutationOptions = Apollo.BaseMutationOptions<UpdateTurnstileConfigMutation, UpdateTurnstileConfigMutationVariables>;
export const UploadFilesDocument = gql`
    query UploadFiles($page: Int, $pageSize: Int, $includeDeleted: Boolean) {
  uploadFiles(page: $page, pageSize: $pageSize, includeDeleted: $includeDeleted) {
    items {
      ...UploadFileFields
    }
    total
    page
    pageSize
  }
}
    ${UploadFileFieldsFragmentDoc}`;

/**
 * __useUploadFilesQuery__
 *
 * To run a query within a React component, call `useUploadFilesQuery` and pass it any options that fit your needs.
 * When your component renders, `useUploadFilesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useUploadFilesQuery({
 *   variables: {
 *      page: // value for 'page'
 *      pageSize: // value for 'pageSize'
 *      includeDeleted: // value for 'includeDeleted'
 *   },
 * });
 */
export function useUploadFilesQuery(baseOptions?: Apollo.QueryHookOptions<UploadFilesQuery, UploadFilesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<UploadFilesQuery, UploadFilesQueryVariables>(UploadFilesDocument, options);
      }
export function useUploadFilesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<UploadFilesQuery, UploadFilesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<UploadFilesQuery, UploadFilesQueryVariables>(UploadFilesDocument, options);
        }
// @ts-ignore
export function useUploadFilesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<UploadFilesQuery, UploadFilesQueryVariables>): Apollo.UseSuspenseQueryResult<UploadFilesQuery, UploadFilesQueryVariables>;
export function useUploadFilesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<UploadFilesQuery, UploadFilesQueryVariables>): Apollo.UseSuspenseQueryResult<UploadFilesQuery | undefined, UploadFilesQueryVariables>;
export function useUploadFilesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<UploadFilesQuery, UploadFilesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<UploadFilesQuery, UploadFilesQueryVariables>(UploadFilesDocument, options);
        }
export type UploadFilesQueryHookResult = ReturnType<typeof useUploadFilesQuery>;
export type UploadFilesLazyQueryHookResult = ReturnType<typeof useUploadFilesLazyQuery>;
export type UploadFilesSuspenseQueryHookResult = ReturnType<typeof useUploadFilesSuspenseQuery>;
export type UploadFilesQueryResult = Apollo.QueryResult<UploadFilesQuery, UploadFilesQueryVariables>;
export const DeleteUploadFileDocument = gql`
    mutation DeleteUploadFile($id: ID!) {
  deleteUploadFile(id: $id) {
    id
    deletedAt
  }
}
    `;
export type DeleteUploadFileMutationFn = Apollo.MutationFunction<DeleteUploadFileMutation, DeleteUploadFileMutationVariables>;

/**
 * __useDeleteUploadFileMutation__
 *
 * To run a mutation, you first call `useDeleteUploadFileMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteUploadFileMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteUploadFileMutation, { data, loading, error }] = useDeleteUploadFileMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteUploadFileMutation(baseOptions?: Apollo.MutationHookOptions<DeleteUploadFileMutation, DeleteUploadFileMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteUploadFileMutation, DeleteUploadFileMutationVariables>(DeleteUploadFileDocument, options);
      }
export type DeleteUploadFileMutationHookResult = ReturnType<typeof useDeleteUploadFileMutation>;
export type DeleteUploadFileMutationResult = Apollo.MutationResult<DeleteUploadFileMutation>;
export type DeleteUploadFileMutationOptions = Apollo.BaseMutationOptions<DeleteUploadFileMutation, DeleteUploadFileMutationVariables>;
export const PublicConfigsDocument = gql`
    query PublicConfigs {
  publicConfigs {
    ...SystemConfigFields
  }
}
    ${SystemConfigFieldsFragmentDoc}`;

/**
 * __usePublicConfigsQuery__
 *
 * To run a query within a React component, call `usePublicConfigsQuery` and pass it any options that fit your needs.
 * When your component renders, `usePublicConfigsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = usePublicConfigsQuery({
 *   variables: {
 *   },
 * });
 */
export function usePublicConfigsQuery(baseOptions?: Apollo.QueryHookOptions<PublicConfigsQuery, PublicConfigsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<PublicConfigsQuery, PublicConfigsQueryVariables>(PublicConfigsDocument, options);
      }
export function usePublicConfigsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<PublicConfigsQuery, PublicConfigsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<PublicConfigsQuery, PublicConfigsQueryVariables>(PublicConfigsDocument, options);
        }
// @ts-ignore
export function usePublicConfigsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<PublicConfigsQuery, PublicConfigsQueryVariables>): Apollo.UseSuspenseQueryResult<PublicConfigsQuery, PublicConfigsQueryVariables>;
export function usePublicConfigsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<PublicConfigsQuery, PublicConfigsQueryVariables>): Apollo.UseSuspenseQueryResult<PublicConfigsQuery | undefined, PublicConfigsQueryVariables>;
export function usePublicConfigsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<PublicConfigsQuery, PublicConfigsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<PublicConfigsQuery, PublicConfigsQueryVariables>(PublicConfigsDocument, options);
        }
export type PublicConfigsQueryHookResult = ReturnType<typeof usePublicConfigsQuery>;
export type PublicConfigsLazyQueryHookResult = ReturnType<typeof usePublicConfigsLazyQuery>;
export type PublicConfigsSuspenseQueryHookResult = ReturnType<typeof usePublicConfigsSuspenseQuery>;
export type PublicConfigsQueryResult = Apollo.QueryResult<PublicConfigsQuery, PublicConfigsQueryVariables>;