import { z } from 'zod';
import { UuidSchema } from '../common.schema.js';

/**
 * 创建管理员菜单 Schema
 * - parentId: 可选，父菜单 ID（UUID）
 * - name: 必填，菜单名称
 * - type: 必填，菜单类型（directory | menu | button）
 * - path: 可选，路由路径
 * - routeName: 可选，前端路由名称
 * - icon: 可选，图标标识
 * - permissionCode: 可选，权限标识（三级命名如 iam:admin:list）
 * - sort: 可选，排序值
 * - visible: 可选，是否显示
 * - keepAlive: 可选，是否缓存
 * - enabled: 可选，是否启用
 */
export const CreateAdminMenuSchema = z
    .object({
        parentId: UuidSchema.nullable().optional(),
        name: z.string().min(1, '菜单名称不能为空').max(100, '菜单名称最多 100 个字符'),
        type: z.enum(['directory', 'menu', 'button'], {
            message: '菜单类型必须是 directory、menu 或 button',
        }),
        path: z.string().max(255, '路由路径最多 255 个字符').optional(),
        routeName: z.string().max(100, '路由名称最多 100 个字符').optional(),
        component: z.string().max(100, '组件名称最多 100 个字符').optional(),
        icon: z.string().max(100, '图标标识最多 100 个字符').optional(),
        permissionCode: z.string().max(100, '权限标识最多 100 个字符').optional(),
        sort: z.number().int().min(0, '排序值不能为负数').optional(),
        visible: z.boolean().optional(),
        keepAlive: z.boolean().optional(),
        enabled: z.boolean().optional(),
    })
    .strict();

/** 创建管理员菜单输入类型 */
export type CreateAdminMenuInput = z.infer<typeof CreateAdminMenuSchema>;

/**
 * 更新管理员菜单 Schema
 * - 基于 CreateAdminMenuSchema.partial()，复用验证规则
 * - 所有字段均可选，但至少需要提供一个字段
 */
export const UpdateAdminMenuSchema = CreateAdminMenuSchema.partial().strict();

/** 更新管理员菜单输入类型 */
export type UpdateAdminMenuInput = z.infer<typeof UpdateAdminMenuSchema>;
