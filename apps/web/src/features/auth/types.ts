/**
 * 会员用户类型定义
 *
 * MemberMe — 通过 GraphQL me 查询返回的会员信息
 * 对应后端 MemberMe 类型（GraphQL union type 的一个分支）
 */

/** 会员用户信息 */
export interface MemberMe {
    /** 账户 ID */
    accountId: string;
    /** 昵称（可选） */
    nickname?: string;
    /** 头像 URL（可选） */
    avatar?: string;
    /** 角色列表（如 ['member']、['vip']、['svip']） */
    roles: string[];
}
