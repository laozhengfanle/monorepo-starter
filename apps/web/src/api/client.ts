/**
 * GraphQL 客户端 — 基于 graphql-request
 *
 * 配置说明：
 *   - 端点：/graphql（开发环境由 Vite 代理到后端）
 *   - credentials: 'include' — 自动携带 httpOnly Cookie
 *   - 前端不存储 token，鉴权完全依赖 Cookie
 *
 * 使用示例：
 *   import { gqlClient } from '@/api/client';
 *   const data = await gqlClient.request(query, variables);
 */
import { GraphQLClient } from 'graphql-request';

/** GraphQL 客户端实例 */
export const gqlClient = new GraphQLClient('/graphql', {
    // 确保跨域请求也携带 Cookie（httpOnly Cookie 鉴权）
    credentials: 'include',
});
