import { z } from 'zod';

/** 角色列表项 */
export const AdminRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  /** 已绑定的权限点编码列表 */
  permissionCodes: z.array(z.string()),
  createdAt: z.iso.datetime(),
});

export type AdminRole = z.infer<typeof AdminRoleSchema>;

/** 权限点（菜单项） */
export const PermissionCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  type: z.string(),
});

export type PermissionCode = z.infer<typeof PermissionCodeSchema>;

/** 创建角色入参 */
export const CreateRoleSchema = z.object({
  name: z.string().min(1, '角色名不能为空').max(50, '角色名最多 50 个字符'),
  code: z
    .string()
    .min(1, '角色编码不能为空')
    .max(50, '角色编码最多 50 个字符')
    .regex(/^[a-z][a-z0-9_]*$/, '角色编码需小写字母开头，仅含小写字母/数字/下划线'),
  description: z.string().max(255, '描述最多 255 个字符').optional(),
  /** 绑定的权限点编码 */
  permissionCodes: z.array(z.string()).optional(),
});

export type CreateRoleInput = z.input<typeof CreateRoleSchema>;

/** 更新角色入参（全字段可选） */
export const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(255).optional(),
  enabled: z.boolean().optional(),
  permissionCodes: z.array(z.string()).optional(),
});

export type UpdateRoleInput = z.input<typeof UpdateRoleSchema>;
