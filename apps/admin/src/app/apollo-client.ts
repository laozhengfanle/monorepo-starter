import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { authStorage } from './auth/auth-storage.js';

/**
 * Apollo Client —— GraphQL 数据层。
 * - errorLink：GraphQL UNAUTHENTICATED / 网络 401 时清 token + 清缓存 + 跳登录
 * - authLink：动态附加 Authorization header（从 authStorage 读 token）
 * - HttpLink 指向相对路径 /graphql：开发环境由 Vite 代理转发，生产由网关重写
 * - normalized cache：查询结果按类型缓存，变更后自动更新
 */

/** 认证失效统一处理：清 token + 清 Apollo 缓存 + 跳登录（避免循环：已在 /login 时不重复跳转） */
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

const authLink = setContext(
  (_, { headers }: { headers?: Record<string, string> }) => {
    const token = authStorage.getAccessToken();
    return {
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  },
);

export const apolloClient = new ApolloClient({
  link: errorLink.concat(authLink).concat(new HttpLink({ uri: '/graphql' })),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
});
