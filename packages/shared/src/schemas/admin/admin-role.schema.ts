import { z } from 'zod';
import { UuidSchema } from '../common.schema.js';

/**
 * 创建管理员角色 Schema
 * - name: 必填，角色名称
 * - code: 必填，角色编码（唯一标识）
 * - description: 可选，角色描述
 * - enabled: 可选，角色启用状态（默认 true，让角色创建后立即可用）
 */
export const CreateAdminRoleSchema = z
    .object({
        name: z.string().min(1, '角色名称不能为空').max(50, '角色名称最多 50 个字符'),
        code: z
            .string()
            .min(1, '角色编码不能为空')
            .max(50, '角色编码最多 50 个字符')
            .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, '角色编码必须以字母开头，只含字母数字下划线'),
        description: z.string().max(255, '描述最多 255 个字符').optional(),
        enabled: z.boolean().optional().default(true),
    })
    .strict();

/** 创建管理员角色输入类型 */
export type CreateAdminRoleInput = z.infer<typeof CreateAdminRoleSchema>;

/**
 * 更新管理员角色 Schema
 * - 基于 CreateAdminRoleSchema.partial()，额外增加 enabled 字段
 * - enabled: 可选，角色启用状态
 */
export const UpdateAdminRoleSchema = CreateAdminRoleSchema.partial()
    .extend({
        enabled: z.boolean().optional(),
    })
    .strict();

/** 更新管理员角色输入类型 */
export type UpdateAdminRoleInput = z.infer<typeof UpdateAdminRoleSchema>;

/**
 * 分配角色菜单 Schema
 * - roleId: UUID 格式的角色 ID
 * - menuIds: UUID 数组
 *   - 可为空数组（取消该角色的所有权限），属于合法操作
 *   - 业务场景：先清空再重选、临时禁用角色所有权限
 */
export const AssignRoleMenusSchema = z
    .object({
        roleId: UuidSchema,
        menuIds: z.array(UuidSchema),
    })
    .strict();

/** 分配角色菜单输入类型 */
export type AssignRoleMenusInput = z.infer<typeof AssignRoleMenusSchema>;
