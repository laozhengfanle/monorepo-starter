/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type * as Types from './graphql-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type AdminAccountsQueryVariables = Exact<{
  query: Types.AdminAccountQueryInput;
}>;


export type AdminAccountsQuery = { adminAccounts: { total: number, page: number, pageSize: number, items: Array<{ accountId: string, username: string, nickname: string, email: string, avatar: string, enabled: boolean, roleCodes: Array<string>, createdAt: string, deletedAt: string | null }> } };

export type AdminRolesQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminRolesQuery = { adminRoles: Array<{ id: string, code: string, name: string }> };

export type CreateAdminAccountMutationVariables = Exact<{
  input: Types.CreateAdminAccountInput;
}>;


export type CreateAdminAccountMutation = { createAdminAccount: { accountId: string, username: string, nickname: string, email: string, enabled: boolean, roleCodes: Array<string> } };

export type UpdateAdminAccountMutationVariables = Exact<{
  id: string | number;
  input: Types.UpdateAdminAccountInput;
}>;


export type UpdateAdminAccountMutation = { updateAdminAccount: { accountId: string, username: string, nickname: string, email: string, enabled: boolean, roleCodes: Array<string> } };

export type DeleteAdminAccountMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteAdminAccountMutation = { deleteAdminAccount: { accountId: string } };

export type MenuNodeFieldsFragment = { id: string, parentId: string | null, name: string, code: string, type: string, path: string | null, icon: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string };

export type MenuTreeQueryVariables = Exact<{ [key: string]: never; }>;


export type MenuTreeQuery = { menuTree: Array<{ id: string, parentId: string | null, name: string, code: string, type: string, path: string | null, icon: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string, children: Array<{ id: string, parentId: string | null, name: string, code: string, type: string, path: string | null, icon: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string, children: Array<{ id: string, parentId: string | null, name: string, code: string, type: string, path: string | null, icon: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string, children: Array<{ id: string, parentId: string | null, name: string, code: string, type: string, path: string | null, icon: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string, children: Array<{ id: string, parentId: string | null, name: string, code: string, type: string, path: string | null, icon: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string }> }> }> }> }> };

export type CreateMenuMutationVariables = Exact<{
  input: Types.CreateMenuInput;
}>;


export type CreateMenuMutation = { createMenu: { id: string, parentId: string | null, name: string, code: string, type: string, path: string | null, icon: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string } };

export type UpdateMenuMutationVariables = Exact<{
  id: string | number;
  input: Types.UpdateMenuInput;
}>;


export type UpdateMenuMutation = { updateMenu: { id: string, parentId: string | null, name: string, code: string, type: string, path: string | null, icon: string | null, sort: number, enabled: boolean, visible: boolean, createdAt: string } };

export type DeleteMenuMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteMenuMutation = { deleteMenu: { id: string } };

export type AdminRoleListQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminRoleListQuery = { adminRoles: Array<{ id: string, name: string, code: string, description: string, enabled: boolean, permissionCodes: Array<string>, createdAt: string }> };

export type PermissionCodeListQueryVariables = Exact<{ [key: string]: never; }>;


export type PermissionCodeListQuery = { permissionCodes: Array<{ id: string, code: string, name: string, type: string }> };

export type CreateRoleMutationVariables = Exact<{
  input: Types.CreateRoleInput;
}>;


export type CreateRoleMutation = { createRole: { id: string, name: string, code: string, description: string, enabled: boolean, permissionCodes: Array<string> } };

export type UpdateRoleMutationVariables = Exact<{
  id: string | number;
  input: Types.UpdateRoleInput;
}>;


export type UpdateRoleMutation = { updateRole: { id: string, name: string, code: string, description: string, enabled: boolean, permissionCodes: Array<string> } };

export type DeleteRoleMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteRoleMutation = { deleteRole: { id: string } };

export type DashboardStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type DashboardStatsQuery = { dashboardStats: Array<{ label: string, value: number, trend: number }> };

export type DashboardTrendQueryVariables = Exact<{
  range?: string | null | undefined;
}>;


export type DashboardTrendQuery = { dashboardTrend: Array<{ label: string, highRisk: number, midRisk: number, lowRisk: number }> };

export type DashboardDistributionQueryVariables = Exact<{ [key: string]: never; }>;


export type DashboardDistributionQuery = { dashboardDistribution: Array<{ label: string, percent: number, color: string }> };

export type DashboardOperationLogsQueryVariables = Exact<{
  page?: number | null | undefined;
  pageSize?: number | null | undefined;
}>;


export type DashboardOperationLogsQuery = { dashboardOperationLogs: { total: number, page: number, pageSize: number, list: Array<{ seq: number, user: string, content: string, module: string, type: string, ip: string, time: string }> } };

export type SysDictItemFieldsFragment = { id: string, label: string, value: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string };

export type SysDictTypeFieldsFragment = { id: string, code: string, name: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string, items: Array<{ id: string, label: string, value: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string }> };

export type SysDictTypesQueryVariables = Exact<{ [key: string]: never; }>;


export type SysDictTypesQuery = { sysDictTypes: Array<{ id: string, code: string, name: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string, items: Array<{ id: string, label: string, value: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string }> }> };

export type CreateDictTypeMutationVariables = Exact<{
  input: Types.CreateDictTypeInput;
}>;


export type CreateDictTypeMutation = { createDictType: { id: string, code: string, name: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string, items: Array<{ id: string, label: string, value: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string }> } };

export type UpdateDictTypeMutationVariables = Exact<{
  id: string | number;
  input: Types.UpdateDictTypeInput;
}>;


export type UpdateDictTypeMutation = { updateDictType: { id: string, code: string, name: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string, items: Array<{ id: string, label: string, value: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string }> } };

export type DeleteDictTypeMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDictTypeMutation = { deleteDictType: boolean };

export type CreateDictItemMutationVariables = Exact<{
  input: Types.CreateDictItemInput;
}>;


export type CreateDictItemMutation = { createDictItem: { id: string, label: string, value: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string } };

export type UpdateDictItemMutationVariables = Exact<{
  id: string | number;
  input: Types.UpdateDictItemInput;
}>;


export type UpdateDictItemMutation = { updateDictItem: { id: string, label: string, value: string, remark: string | null, enabled: boolean, sort: number, createdAt: string, updatedAt: string } };

export type DeleteDictItemMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDictItemMutation = { deleteDictItem: boolean };

export type SystemConfigFieldsFragment = { id: string, key: string, value: unknown, remark: string | null, updatedBy: string | null, createdAt: string, updatedAt: string };

export type AdminConfigsQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminConfigsQuery = { adminConfigs: Array<{ id: string, key: string, value: unknown, remark: string | null, updatedBy: string | null, createdAt: string, updatedAt: string }> };

export type BatchUpdateConfigsMutationVariables = Exact<{
  input: Types.BatchUpdateConfigsInput;
}>;


export type BatchUpdateConfigsMutation = { batchUpdateConfigs: Array<{ id: string, key: string, value: unknown, remark: string | null, updatedBy: string | null, createdAt: string, updatedAt: string }> };

export type AuditLogFieldsFragment = { id: string, accountId: string | null, accountUsername: string | null, action: string, resourceType: string | null, resourceId: string | null, detail: string | null, ip: string | null, userAgent: string | null, createdAt: string };

export type AdminLogsQueryVariables = Exact<{
  query: Types.AuditLogQueryInput;
}>;


export type AdminLogsQuery = { adminLogs: { total: number, page: number, pageSize: number, items: Array<{ id: string, accountId: string | null, accountUsername: string | null, action: string, resourceType: string | null, resourceId: string | null, detail: string | null, ip: string | null, userAgent: string | null, createdAt: string }> } };

export type ExportAuditLogsQueryVariables = Exact<{
  query: Types.AuditLogQueryInput;
}>;


export type ExportAuditLogsQuery = { exportAuditLogs: Array<{ id: string, accountId: string | null, accountUsername: string | null, action: string, resourceType: string | null, resourceId: string | null, detail: string | null, ip: string | null, userAgent: string | null, createdAt: string }> };

export type ClearAuditLogsMutationVariables = Exact<{ [key: string]: never; }>;


export type ClearAuditLogsMutation = { clearAuditLogs: { deletedCount: number } };

export type DeleteAuditLogMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteAuditLogMutation = { deleteAuditLog: boolean };

export type CacheKeyFieldsFragment = { key: string, type: string, ttl: number, value: string | null, size: number };

export type CacheKeysQueryVariables = Exact<{
  pattern?: string | null | undefined;
  offset?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type CacheKeysQuery = { cacheKeys: Array<{ key: string, type: string, ttl: number, value: string | null, size: number }> };

export type CacheKeyTotalQueryVariables = Exact<{
  pattern?: string | null | undefined;
}>;


export type CacheKeyTotalQuery = { cacheKeyTotal: number };

export type CacheKeyQueryVariables = Exact<{
  key: string;
}>;


export type CacheKeyQuery = { cacheKey: { key: string, type: string, ttl: number, value: string | null, size: number } };

export type CacheStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type CacheStatsQuery = { cacheStats: { usedMemory: string, hitRate: string, uptime: string } };

export type DeleteCacheKeyMutationVariables = Exact<{
  key: string;
}>;


export type DeleteCacheKeyMutation = { deleteCacheKey: boolean };

export type DeleteCacheKeysMutationVariables = Exact<{
  keys: Array<string> | string;
}>;


export type DeleteCacheKeysMutation = { deleteCacheKeys: { deletedCount: number, keys: Array<string> } };

export type ClearCacheByPatternMutationVariables = Exact<{
  pattern: string;
}>;


export type ClearCacheByPatternMutation = { clearCacheByPattern: number };

export type StorageConfigQueryVariables = Exact<{ [key: string]: never; }>;


export type StorageConfigQuery = { storageConfig: { id: string, key: string, value: unknown, remark: string | null, updatedBy: string | null, createdAt: string, updatedAt: string } | null };

export type TurnstileConfigQueryVariables = Exact<{ [key: string]: never; }>;


export type TurnstileConfigQuery = { turnstileConfig: { id: string, key: string, value: unknown, remark: string | null, updatedBy: string | null, createdAt: string, updatedAt: string } | null };

export type UpdateTurnstileConfigMutationVariables = Exact<{
  input: Types.UpdateConfigInput;
}>;


export type UpdateTurnstileConfigMutation = { updateTurnstileConfig: { id: string, key: string, value: unknown, remark: string | null, updatedBy: string | null, createdAt: string, updatedAt: string } };

export type UploadFileFieldsFragment = { id: string, originalName: string, storedName: string, mimeType: string, size: number, url: string, accountId: string | null, createdAt: string, deletedAt: string | null };

export type UploadFilesQueryVariables = Exact<{
  page?: number | null | undefined;
  pageSize?: number | null | undefined;
  includeDeleted?: boolean | null | undefined;
}>;


export type UploadFilesQuery = { uploadFiles: { total: number, page: number, pageSize: number, items: Array<{ id: string, originalName: string, storedName: string, mimeType: string, size: number, url: string, accountId: string | null, createdAt: string, deletedAt: string | null }> } };

export type DeleteUploadFileMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteUploadFileMutation = { deleteUploadFile: { id: string, deletedAt: string | null } };

export type PublicConfigsQueryVariables = Exact<{ [key: string]: never; }>;


export type PublicConfigsQuery = { publicConfigs: Array<{ id: string, key: string, value: unknown, remark: string | null, updatedBy: string | null, createdAt: string, updatedAt: string }> };

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
export const DashboardStatsDocument = gql`
    query DashboardStats {
  dashboardStats {
    label
    value
    trend
  }
}
    `;

/**
 * __useDashboardStatsQuery__
 *
 * To run a query within a React component, call `useDashboardStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useDashboardStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDashboardStatsQuery({
 *   variables: {
 *   },
 * });
 */
export function useDashboardStatsQuery(baseOptions?: Apollo.QueryHookOptions<DashboardStatsQuery, DashboardStatsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<DashboardStatsQuery, DashboardStatsQueryVariables>(DashboardStatsDocument, options);
      }
export function useDashboardStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<DashboardStatsQuery, DashboardStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<DashboardStatsQuery, DashboardStatsQueryVariables>(DashboardStatsDocument, options);
        }
// @ts-ignore
export function useDashboardStatsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<DashboardStatsQuery, DashboardStatsQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardStatsQuery, DashboardStatsQueryVariables>;
export function useDashboardStatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardStatsQuery, DashboardStatsQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardStatsQuery | undefined, DashboardStatsQueryVariables>;
export function useDashboardStatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardStatsQuery, DashboardStatsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<DashboardStatsQuery, DashboardStatsQueryVariables>(DashboardStatsDocument, options);
        }
export type DashboardStatsQueryHookResult = ReturnType<typeof useDashboardStatsQuery>;
export type DashboardStatsLazyQueryHookResult = ReturnType<typeof useDashboardStatsLazyQuery>;
export type DashboardStatsSuspenseQueryHookResult = ReturnType<typeof useDashboardStatsSuspenseQuery>;
export type DashboardStatsQueryResult = Apollo.QueryResult<DashboardStatsQuery, DashboardStatsQueryVariables>;
export const DashboardTrendDocument = gql`
    query DashboardTrend($range: String) {
  dashboardTrend(range: $range) {
    label
    highRisk
    midRisk
    lowRisk
  }
}
    `;

/**
 * __useDashboardTrendQuery__
 *
 * To run a query within a React component, call `useDashboardTrendQuery` and pass it any options that fit your needs.
 * When your component renders, `useDashboardTrendQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDashboardTrendQuery({
 *   variables: {
 *      range: // value for 'range'
 *   },
 * });
 */
export function useDashboardTrendQuery(baseOptions?: Apollo.QueryHookOptions<DashboardTrendQuery, DashboardTrendQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<DashboardTrendQuery, DashboardTrendQueryVariables>(DashboardTrendDocument, options);
      }
export function useDashboardTrendLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<DashboardTrendQuery, DashboardTrendQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<DashboardTrendQuery, DashboardTrendQueryVariables>(DashboardTrendDocument, options);
        }
// @ts-ignore
export function useDashboardTrendSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<DashboardTrendQuery, DashboardTrendQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardTrendQuery, DashboardTrendQueryVariables>;
export function useDashboardTrendSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardTrendQuery, DashboardTrendQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardTrendQuery | undefined, DashboardTrendQueryVariables>;
export function useDashboardTrendSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardTrendQuery, DashboardTrendQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<DashboardTrendQuery, DashboardTrendQueryVariables>(DashboardTrendDocument, options);
        }
export type DashboardTrendQueryHookResult = ReturnType<typeof useDashboardTrendQuery>;
export type DashboardTrendLazyQueryHookResult = ReturnType<typeof useDashboardTrendLazyQuery>;
export type DashboardTrendSuspenseQueryHookResult = ReturnType<typeof useDashboardTrendSuspenseQuery>;
export type DashboardTrendQueryResult = Apollo.QueryResult<DashboardTrendQuery, DashboardTrendQueryVariables>;
export const DashboardDistributionDocument = gql`
    query DashboardDistribution {
  dashboardDistribution {
    label
    percent
    color
  }
}
    `;

/**
 * __useDashboardDistributionQuery__
 *
 * To run a query within a React component, call `useDashboardDistributionQuery` and pass it any options that fit your needs.
 * When your component renders, `useDashboardDistributionQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDashboardDistributionQuery({
 *   variables: {
 *   },
 * });
 */
export function useDashboardDistributionQuery(baseOptions?: Apollo.QueryHookOptions<DashboardDistributionQuery, DashboardDistributionQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<DashboardDistributionQuery, DashboardDistributionQueryVariables>(DashboardDistributionDocument, options);
      }
export function useDashboardDistributionLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<DashboardDistributionQuery, DashboardDistributionQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<DashboardDistributionQuery, DashboardDistributionQueryVariables>(DashboardDistributionDocument, options);
        }
// @ts-ignore
export function useDashboardDistributionSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<DashboardDistributionQuery, DashboardDistributionQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardDistributionQuery, DashboardDistributionQueryVariables>;
export function useDashboardDistributionSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardDistributionQuery, DashboardDistributionQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardDistributionQuery | undefined, DashboardDistributionQueryVariables>;
export function useDashboardDistributionSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardDistributionQuery, DashboardDistributionQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<DashboardDistributionQuery, DashboardDistributionQueryVariables>(DashboardDistributionDocument, options);
        }
export type DashboardDistributionQueryHookResult = ReturnType<typeof useDashboardDistributionQuery>;
export type DashboardDistributionLazyQueryHookResult = ReturnType<typeof useDashboardDistributionLazyQuery>;
export type DashboardDistributionSuspenseQueryHookResult = ReturnType<typeof useDashboardDistributionSuspenseQuery>;
export type DashboardDistributionQueryResult = Apollo.QueryResult<DashboardDistributionQuery, DashboardDistributionQueryVariables>;
export const DashboardOperationLogsDocument = gql`
    query DashboardOperationLogs($page: Int, $pageSize: Int) {
  dashboardOperationLogs(page: $page, pageSize: $pageSize) {
    list {
      seq
      user
      content
      module
      type
      ip
      time
    }
    total
    page
    pageSize
  }
}
    `;

/**
 * __useDashboardOperationLogsQuery__
 *
 * To run a query within a React component, call `useDashboardOperationLogsQuery` and pass it any options that fit your needs.
 * When your component renders, `useDashboardOperationLogsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDashboardOperationLogsQuery({
 *   variables: {
 *      page: // value for 'page'
 *      pageSize: // value for 'pageSize'
 *   },
 * });
 */
export function useDashboardOperationLogsQuery(baseOptions?: Apollo.QueryHookOptions<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>(DashboardOperationLogsDocument, options);
      }
export function useDashboardOperationLogsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>(DashboardOperationLogsDocument, options);
        }
// @ts-ignore
export function useDashboardOperationLogsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>;
export function useDashboardOperationLogsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>): Apollo.UseSuspenseQueryResult<DashboardOperationLogsQuery | undefined, DashboardOperationLogsQueryVariables>;
export function useDashboardOperationLogsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>(DashboardOperationLogsDocument, options);
        }
export type DashboardOperationLogsQueryHookResult = ReturnType<typeof useDashboardOperationLogsQuery>;
export type DashboardOperationLogsLazyQueryHookResult = ReturnType<typeof useDashboardOperationLogsLazyQuery>;
export type DashboardOperationLogsSuspenseQueryHookResult = ReturnType<typeof useDashboardOperationLogsSuspenseQuery>;
export type DashboardOperationLogsQueryResult = Apollo.QueryResult<DashboardOperationLogsQuery, DashboardOperationLogsQueryVariables>;
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