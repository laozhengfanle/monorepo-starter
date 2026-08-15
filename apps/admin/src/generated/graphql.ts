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
};

export type AdminAccount = {
  __typename?: 'AdminAccount';
  accountId: Scalars['ID']['output'];
  avatar: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  nickname: Scalars['String']['output'];
  roleCodes: Array<Scalars['String']['output']>;
  username: Scalars['String']['output'];
};

export type AdminMe = {
  __typename?: 'AdminMe';
  accountId: Scalars['ID']['output'];
  avatar: Scalars['String']['output'];
  nickname: Scalars['String']['output'];
  permissions: Array<Scalars['String']['output']>;
  roleCodes: Array<Scalars['String']['output']>;
  username: Scalars['String']['output'];
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

export type AuthResult = {
  __typename?: 'AuthResult';
  accessToken: Scalars['String']['output'];
  expiresIn: Scalars['Int']['output'];
  refreshToken: Scalars['String']['output'];
};

export type CreateAdminAccountInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  nickname?: InputMaybe<Scalars['String']['input']>;
  password: Scalars['String']['input'];
  roleCodes: Array<Scalars['String']['input']>;
  username: Scalars['String']['input'];
};

export type CreateRoleInput = {
  code: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  permissionCodes?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreateUserInput = {
  email: Scalars['String']['input'];
  role?: InputMaybe<UserRole>;
  status?: InputMaybe<UserStatus>;
  username: Scalars['String']['input'];
};

export type LoginInput = {
  password: Scalars['String']['input'];
  username: Scalars['String']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  createAdminAccount: AdminAccount;
  createRole: AdminRole;
  createUser: User;
  deleteAdminAccount: AdminAccount;
  deleteRole: AdminRole;
  deleteUser: User;
  login: AuthResult;
  updateAdminAccount: AdminAccount;
  updateRole: AdminRole;
  updateUser: User;
};


export type MutationCreateAdminAccountArgs = {
  input: CreateAdminAccountInput;
};


export type MutationCreateRoleArgs = {
  input: CreateRoleInput;
};


export type MutationCreateUserArgs = {
  input: CreateUserInput;
};


export type MutationDeleteAdminAccountArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteRoleArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteUserArgs = {
  id: Scalars['ID']['input'];
};


export type MutationLoginArgs = {
  input: LoginInput;
};


export type MutationUpdateAdminAccountArgs = {
  id: Scalars['ID']['input'];
  input: UpdateAdminAccountInput;
};


export type MutationUpdateRoleArgs = {
  id: Scalars['ID']['input'];
  input: UpdateRoleInput;
};


export type MutationUpdateUserArgs = {
  id: Scalars['ID']['input'];
  input: UpdateUserInput;
};

export type PaginatedAdminAccounts = {
  __typename?: 'PaginatedAdminAccounts';
  items: Array<AdminAccount>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type PaginatedUsers = {
  __typename?: 'PaginatedUsers';
  items: Array<User>;
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
  adminRoles: Array<AdminRole>;
  me: AdminMe;
  permissionCodes: Array<PermissionCode>;
  user?: Maybe<User>;
  users: PaginatedUsers;
};


export type QueryAdminAccountsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryUserArgs = {
  id: Scalars['ID']['input'];
};


export type QueryUsersArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateAdminAccountInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  nickname?: InputMaybe<Scalars['String']['input']>;
  roleCodes?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateRoleInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  permissionCodes?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateUserInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<UserRole>;
  status?: InputMaybe<UserStatus>;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  __typename?: 'User';
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  role: UserRole;
  status: UserStatus;
  username: Scalars['String']['output'];
};

export enum UserRole {
  Admin = 'admin',
  Member = 'member'
}

export enum UserStatus {
  Active = 'active',
  Disabled = 'disabled',
  Locked = 'locked'
}

export type AdminAccountsQueryVariables = Exact<{
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
}>;


export type AdminAccountsQuery = { __typename?: 'Query', adminAccounts: { __typename?: 'PaginatedAdminAccounts', total: number, page: number, pageSize: number, items: Array<{ __typename?: 'AdminAccount', accountId: string, username: string, nickname: string, email: string, avatar: string, enabled: boolean, roleCodes: Array<string>, createdAt: string }> } };

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

export type UsersQueryVariables = Exact<{
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
}>;


export type UsersQuery = { __typename?: 'Query', users: { __typename?: 'PaginatedUsers', total: number, page: number, pageSize: number, items: Array<{ __typename?: 'User', id: string, username: string, email: string, role: UserRole, status: UserStatus, createdAt: string }> } };

export type CreateUserMutationVariables = Exact<{
  input: CreateUserInput;
}>;


export type CreateUserMutation = { __typename?: 'Mutation', createUser: { __typename?: 'User', id: string, username: string, email: string, role: UserRole, status: UserStatus, createdAt: string } };

export type UpdateUserMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateUserInput;
}>;


export type UpdateUserMutation = { __typename?: 'Mutation', updateUser: { __typename?: 'User', id: string, username: string, email: string, role: UserRole, status: UserStatus, createdAt: string } };

export type DeleteUserMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteUserMutation = { __typename?: 'Mutation', deleteUser: { __typename?: 'User', id: string } };


export const AdminAccountsDocument = gql`
    query AdminAccounts($page: Int, $pageSize: Int) {
  adminAccounts(page: $page, pageSize: $pageSize) {
    items {
      accountId
      username
      nickname
      email
      avatar
      enabled
      roleCodes
      createdAt
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
 *      page: // value for 'page'
 *      pageSize: // value for 'pageSize'
 *   },
 * });
 */
export function useAdminAccountsQuery(baseOptions?: Apollo.QueryHookOptions<AdminAccountsQuery, AdminAccountsQueryVariables>) {
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
export const UsersDocument = gql`
    query Users($page: Int, $pageSize: Int) {
  users(page: $page, pageSize: $pageSize) {
    items {
      id
      username
      email
      role
      status
      createdAt
    }
    total
    page
    pageSize
  }
}
    `;

/**
 * __useUsersQuery__
 *
 * To run a query within a React component, call `useUsersQuery` and pass it any options that fit your needs.
 * When your component renders, `useUsersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useUsersQuery({
 *   variables: {
 *      page: // value for 'page'
 *      pageSize: // value for 'pageSize'
 *   },
 * });
 */
export function useUsersQuery(baseOptions?: Apollo.QueryHookOptions<UsersQuery, UsersQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<UsersQuery, UsersQueryVariables>(UsersDocument, options);
      }
export function useUsersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<UsersQuery, UsersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<UsersQuery, UsersQueryVariables>(UsersDocument, options);
        }
// @ts-ignore
export function useUsersSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<UsersQuery, UsersQueryVariables>): Apollo.UseSuspenseQueryResult<UsersQuery, UsersQueryVariables>;
export function useUsersSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<UsersQuery, UsersQueryVariables>): Apollo.UseSuspenseQueryResult<UsersQuery | undefined, UsersQueryVariables>;
export function useUsersSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<UsersQuery, UsersQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<UsersQuery, UsersQueryVariables>(UsersDocument, options);
        }
export type UsersQueryHookResult = ReturnType<typeof useUsersQuery>;
export type UsersLazyQueryHookResult = ReturnType<typeof useUsersLazyQuery>;
export type UsersSuspenseQueryHookResult = ReturnType<typeof useUsersSuspenseQuery>;
export type UsersQueryResult = Apollo.QueryResult<UsersQuery, UsersQueryVariables>;
export const CreateUserDocument = gql`
    mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    username
    email
    role
    status
    createdAt
  }
}
    `;
export type CreateUserMutationFn = Apollo.MutationFunction<CreateUserMutation, CreateUserMutationVariables>;

/**
 * __useCreateUserMutation__
 *
 * To run a mutation, you first call `useCreateUserMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateUserMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createUserMutation, { data, loading, error }] = useCreateUserMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateUserMutation(baseOptions?: Apollo.MutationHookOptions<CreateUserMutation, CreateUserMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateUserMutation, CreateUserMutationVariables>(CreateUserDocument, options);
      }
export type CreateUserMutationHookResult = ReturnType<typeof useCreateUserMutation>;
export type CreateUserMutationResult = Apollo.MutationResult<CreateUserMutation>;
export type CreateUserMutationOptions = Apollo.BaseMutationOptions<CreateUserMutation, CreateUserMutationVariables>;
export const UpdateUserDocument = gql`
    mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
  updateUser(id: $id, input: $input) {
    id
    username
    email
    role
    status
    createdAt
  }
}
    `;
export type UpdateUserMutationFn = Apollo.MutationFunction<UpdateUserMutation, UpdateUserMutationVariables>;

/**
 * __useUpdateUserMutation__
 *
 * To run a mutation, you first call `useUpdateUserMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateUserMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateUserMutation, { data, loading, error }] = useUpdateUserMutation({
 *   variables: {
 *      id: // value for 'id'
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateUserMutation(baseOptions?: Apollo.MutationHookOptions<UpdateUserMutation, UpdateUserMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateUserMutation, UpdateUserMutationVariables>(UpdateUserDocument, options);
      }
export type UpdateUserMutationHookResult = ReturnType<typeof useUpdateUserMutation>;
export type UpdateUserMutationResult = Apollo.MutationResult<UpdateUserMutation>;
export type UpdateUserMutationOptions = Apollo.BaseMutationOptions<UpdateUserMutation, UpdateUserMutationVariables>;
export const DeleteUserDocument = gql`
    mutation DeleteUser($id: ID!) {
  deleteUser(id: $id) {
    id
  }
}
    `;
export type DeleteUserMutationFn = Apollo.MutationFunction<DeleteUserMutation, DeleteUserMutationVariables>;

/**
 * __useDeleteUserMutation__
 *
 * To run a mutation, you first call `useDeleteUserMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteUserMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteUserMutation, { data, loading, error }] = useDeleteUserMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteUserMutation(baseOptions?: Apollo.MutationHookOptions<DeleteUserMutation, DeleteUserMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteUserMutation, DeleteUserMutationVariables>(DeleteUserDocument, options);
      }
export type DeleteUserMutationHookResult = ReturnType<typeof useDeleteUserMutation>;
export type DeleteUserMutationResult = Apollo.MutationResult<DeleteUserMutation>;
export type DeleteUserMutationOptions = Apollo.BaseMutationOptions<DeleteUserMutation, DeleteUserMutationVariables>;