/**
 * 上传相关 Schema
 * - 通用查询参数 + 文件元数据
 */
import { z } from 'zod';
import { PaginationSchema, UuidSchema } from '../common.schema.js';

/**
 * 上传查询 Schema
 * - 继承分页参数
 * - mimeType: 可选，按 MIME 筛选
 * - folder: 可选，按文件夹筛选
 * - accountId: 可选，按上传者筛选
 * - includeDeleted: 可选，是否包含已软删除的文件（默认 false）
 *   - true 时返回所有行（含已软删的，deletedAt 非空）
 *   - false 时只返回活跃行（deletedAt IS NULL）
 */
export const QueryUploadSchema = PaginationSchema.extend({
    mimeType: z.string().max(100, 'MIME 类型最长 100 字符').optional(),
    folder: z.string().max(50, '文件夹名最长 50 字符').optional(),
    accountId: UuidSchema.optional(),
    includeDeleted: z.boolean().optional().default(false),
}).strict();

/** 上传查询输入类型 */
export type QueryUploadInput = z.infer<typeof QueryUploadSchema>;

/**
 * 文件元数据 Schema
 * - 用于 GraphQL 响应中校验字段
 */
export const UploadFileMetaSchema = z
    .object({
        id: UuidSchema,
        accountId: UuidSchema,
        originalName: z.string(),
        storedName: z.string(),
        mimeType: z.string(),
        size: z.number().int().nonnegative(),
        storage: z.string(),
        folder: z.string(),
        url: z.string(),
        createdAt: z.coerce.date(),
    })
    .strict();

/** 文件元数据类型 */
export type UploadFileMeta = z.infer<typeof UploadFileMetaSchema>;
