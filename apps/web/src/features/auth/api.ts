/**
 * 认证 GraphQL API — 会员端
 *
 *   - GraphQL：查询用户信息等
 *
 * Token 策略：
 *   - httpOnly Cookie 由后端管理，前端不持有 token 值
 *   - credentials: 'include' 确保跨域请求也携带 Cookie
 */
import { gqlClient } from '@/api/client';
import type { MemberMe } from './types';

/**
 * 查询当前登录会员信息（GraphQL）
 *
 * 使用 GraphQL union type，后端根据认证身份返回不同类型：
 *   - 已登录会员 → MemberMe（包含 accountId、nickname、avatar、roles）
 *   - 未登录 → null
 *
 * @returns 会员信息，未登录时返回 null
 */
export async function fetchMe(): Promise<MemberMe | null> {
    const query = `
        query {
            me {
                ... on MemberMe {
                    accountId
                    nickname
                    avatar
                    roles
                }
            }
        }
    `;

    const data = await gqlClient.request<{ me: MemberMe | null }>(query);
    return data.me;
}
