/**
 * 系统配置 Schema
 *
 * 说明：DB schema（prisma）实际只有 id/key/value/remark/updatedBy/createdAt/updatedAt，
 *      所以这里移除了 type/description/group 字段，避免和 DB 不一致（与 server 端 type.ts / input.ts 保持一致）。
 */
import { z } from 'zod';

/**
 * 系统配置 Key Schema
 * - key: 必填，全局唯一标识
 * - 允许小写字母开头，含字母数字下划线和点号（如 sms.provider）
 */
export const SystemConfigKeySchema = z
    .string()
    .min(1, '配置键不能为空')
    .max(100, '配置键最长 100 字符')
    .regex(/^[a-z][a-z0-9_.]*$/, '配置键必须以小写字母开头，只含字母数字下划线点号');

/** 配置 Key 类型 */
export type SystemConfigKey = z.infer<typeof SystemConfigKeySchema>;

/**
 * 创建系统配置 Schema
 * - key: 必填，全局唯一标识
 * - value: 必填（DB 中为 Json，但 GraphQL/Zod 这边先按 string 校验；service 写入时转换）
 */
export const CreateSystemConfigSchema = z
    .object({
        key: SystemConfigKeySchema,
        value: z.string().min(1, '配置值不能为空'),
    })
    .strict();

/** 创建系统配置输入类型 */
export type CreateSystemConfigInput = z.infer<typeof CreateSystemConfigSchema>;

/**
 * 更新系统配置 Schema
 * - 可更新除 key 外的字段
 * - key 是主键，不能修改（需删除重建）
 *
 * 说明：value 在新接口（updateConfig / batchUpdateConfigs）中是 JSON 对象（Map），
 *      旧接口（updateSystemConfig）保留为字符串以便兼容
 */
export const UpdateSystemConfigSchema = z
    .object({
        value: z.string().min(1, '配置值不能为空'),
    })
    .strict();

/** 更新系统配置输入类型 */
export type UpdateSystemConfigInput = z.infer<typeof UpdateSystemConfigSchema>;

/**
 * 单条更新配置 Schema（新接口 updateConfig 使用）
 * - key: 必填，要更新的配置项
 * - value: 必填，JSON 对象（前端传 object，不做 JSON.stringify 包装）
 */
export const ConfigUpdateItemSchema = z
    .object({
        key: SystemConfigKeySchema,
        value: z.record(z.string(), z.unknown()),
    })
    .strict();

/** 单条更新配置类型 */
export type ConfigUpdateItem = z.infer<typeof ConfigUpdateItemSchema>;

/**
 * 单条更新配置 Schema（service 内部使用，value 允许原始 unknown）
 *
 * 说明：与 ConfigUpdateItemSchema 区别仅是 value 字段更宽松（unknown 而非 record），
 *      因为 service 写入时可能接收 GraphQL JSON scalar 解析后的对象
 */
export const ConfigUpdateValueSchema = z
    .object({
        key: SystemConfigKeySchema,
        value: z.unknown(),
    })
    .strict();

/** 单条更新配置值类型（service 层） */
export type ConfigUpdateValue = z.infer<typeof ConfigUpdateValueSchema>;

/**
 * 批量更新配置 Schema（新接口 batchUpdateConfigs 使用）
 * - updates: 必填，至少 1 条
 * - 每条格式同 ConfigUpdateItemSchema
 */
export const BatchUpdateConfigsSchema = z
    .object({
        updates: z.array(ConfigUpdateItemSchema).min(1, '批量更新至少 1 条').max(100, '单次最多 100 条'),
    })
    .strict();

/** 批量更新配置类型 */
export type BatchUpdateConfigsInput = z.infer<typeof BatchUpdateConfigsSchema>;
