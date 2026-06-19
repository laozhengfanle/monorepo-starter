import { z } from 'zod';
import { PaginationSchema } from '../common.schema.js';

/**
 * 更新 C 端用户档案 Schema
 * - nickname: 可选，昵称
 * - avatar: 可选，头像 URL
 */
export const UpdateMemberProfileSchema = z
    .object({
        nickname: z.string().min(1, '昵称不能为空').max(50, '昵称最多 50 个字符').optional(),
        avatar: z.string().max(255, '头像 URL 最多 255 个字符').optional(),
    })
    .strict();

/** 更新 C 端用户档案输入类型 */
export type UpdateMemberProfileInput = z.infer<typeof UpdateMemberProfileSchema>;

/**
 * 查询 C 端用户档案 Schema
 * - 继承分页参数
 * - keyword: 可选，模糊搜索关键词
 */
export const QueryMemberProfileSchema = PaginationSchema.extend({
    keyword: z.string().max(100, '关键词最多 100 个字符').optional(),
}).strict();

/** 查询 C 端用户档案输入类型 */
export type QueryMemberProfileInput = z.infer<typeof QueryMemberProfileSchema>;
