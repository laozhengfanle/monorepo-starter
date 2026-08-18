import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { authStorage } from './auth/auth-storage.js';

/**
 * Apollo Client —— GraphQL 数据层。
 * - errorLink：GraphQL UNAUTHENTICATED / 网络 401 时清会话 + 清缓存 + 跳登录
 * - HttpLink：相对路径 /graphql + credentials 'include'（P1-7 改造：
 *   access token 在 httpOnly cookie，由浏览器自动携带，不再手动附加 Authorization header）
 * - normalized cache：查询结果按类型缓存，变更后自动更新
 */

/** 认证失效统一处理：清内存会话 + 清 Apollo 缓存 + 跳登录（避免循环：已在 /login 时不重复跳转） */
function handleUnauthenticated(): void {
  authStorage.clear();
  void apolloClient.clearStore().catch(() => undefined);
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

const errorLink = onError(({ graphQLErrors, networkError }) => {
  // GraphQL 层：extensions.code === 'UNAUTHENTICATED'
  const isGraphQLAuthError =
    graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED') ??
    false;
  // 网络层：HTTP 401（Apollo Server 对未认证请求返回 401）
  const isNetwork401 =
    networkError != null &&
    'statusCode' in networkError &&
    (networkError as { statusCode?: number }).statusCode === 401;
  if (isGraphQLAuthError || isNetwork401) {
    handleUnauthenticated();
  }
});

export const apolloClient = new ApolloClient({
  link: errorLink.concat(
    new HttpLink({
      uri: '/graphql',
      credentials: 'include',
    }),
  ),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
});
