import { z } from 'zod';

/** 菜单/权限点类型：目录（分组） / 菜单（页面入口，有 path） / 按钮（操作权限点） */
export const MenuTypeSchema = z.enum(['directory', 'menu', 'button']);

export type MenuType = z.infer<typeof MenuTypeSchema>;

/** 菜单节点（含子节点，用于菜单树 / 侧栏渲染） */
export const AdminMenuSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  /** 权限机器编码：menu/button 为 permissionCode（如 account:list），directory 为占位编码（如 account-center） */
  code: z.string(),
  type: MenuTypeSchema,
  /** 前端路由路径（仅 menu 类型），如 /admin/roles */
  path: z.string().nullable(),
  /** 前端图标名（仅 directory/menu 类型），如 TeamOutlined */
  icon: z.string().nullable(),
  sort: z.number().int(),
  enabled: z.boolean(),
  /** 是否在侧栏显示（false = hideInMenu，如全局权限目录） */
  visible: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type AdminMenu = z.infer<typeof AdminMenuSchema>;

/** 菜单树节点（递归：children 按 sort 升序） */
export interface AdminMenuNode extends AdminMenu {
  children: AdminMenuNode[];
}

export const AdminMenuNodeSchema: z.ZodType<AdminMenuNode> =
  AdminMenuSchema.extend({
    children: z.array(z.lazy(() => AdminMenuNodeSchema)),
  });

/** 创建菜单入参 */
export const CreateMenuSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1, '菜单名不能为空').max(50, '菜单名最多 50 个字符'),
  code: z
    .string()
    .min(1, '编码不能为空')
    .max(100, '编码最多 100 个字符')
    .regex(
      /^[a-z][a-z0-9:_-]*$/,
      '编码需小写字母开头，仅含小写字母/数字/下划线/冒号/中划线',
    ),
  type: MenuTypeSchema,
  path: z.string().max(200, '路由最多 200 个字符').optional(),
  icon: z.string().max(50, '图标名最多 50 个字符').optional(),
  sort: z
    .number()
    .int()
    .min(0, '排序不小于 0')
    .max(9999, '排序不超过 9999')
    .optional(),
  visible: z.boolean().optional(),
});

export type CreateMenuInput = z.input<typeof CreateMenuSchema>;

/** 更新菜单入参（全字段可选） */
export const UpdateMenuSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z
    .string()
    .min(1, '菜单名不能为空')
    .max(50, '菜单名最多 50 个字符')
    .optional(),
  type: MenuTypeSchema.optional(),
  path: z.string().max(200, '路由最多 200 个字符').optional(),
  icon: z.string().max(50, '图标名最多 50 个字符').optional(),
  sort: z.number().int().min(0).max(9999).optional(),
  enabled: z.boolean().optional(),
  visible: z.boolean().optional(),
});

export type UpdateMenuInput = z.input<typeof UpdateMenuSchema>;
