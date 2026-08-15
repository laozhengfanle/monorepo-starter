import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { authStorage } from './auth/auth-storage.js';

/**
 * Apollo Client —— GraphQL 数据层。
 * - authLink：动态附加 Authorization header（从 authStorage 读 token）
 * - HttpLink 指向相对路径 /graphql：开发环境由 Vite 代理转发，生产由网关重写
 * - normalized cache：查询结果按类型缓存，变更后自动更新
 */
const authLink = setContext((_, { headers }: { headers?: Record<string, string> }) => {
  const token = authStorage.getAccessToken();
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(new HttpLink({ uri: '/graphql' })),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
});
