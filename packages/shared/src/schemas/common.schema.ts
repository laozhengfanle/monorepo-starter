import { z } from 'zod';

/**
 * 分页查询基础 Schema
 * - page: 当前页码，最小 1，默认 1
 * - pageSize: 每页条数，最小 1，最大 100，默认 20
 */
export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** 分页查询输入类型 */
export type PaginationInput = z.infer<typeof PaginationSchema>;

/**
 * UUID 字符串校验 Schema
 * - 校验标准 UUID v4/v7 格式
 */
export const UuidSchema = z.string().uuid();

/** 空对象 Schema，用于无参数查询 */
export const EmptyObjectSchema = z.object({}).optional();

/**
 * 统一错误响应 Schema
 * - code: 业务错误码（数字）
 * - message: 错误描述信息
 * - data: 错误详情（通常为 null）
 */
export const ErrorResponseSchema = z.object({
    code: z.number(),
    message: z.string(),
    data: z.nullable(z.unknown()),
});
