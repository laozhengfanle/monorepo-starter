import { z } from 'zod';

/** 账户列表查询参数（服务端筛选，对标老项目 Vue 管理员查询） */
export const AdminAccountQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** 按用户名模糊搜索（identityType=username 的 identifier） */
  username: z.string().max(50, '用户名最多 50 个字符').optional(),
  /** 按邮箱模糊搜索（admin_profile.email） */
  email: z.string().max(100, '邮箱最多 100 个字符').optional(),
  /** 按角色编码精确筛选 */
  roleCode: z.string().max(100, '角色编码最多 100 个字符').optional(),
  /** 状态筛选：true=正常 / false=禁用 / 不传=全部 */
  enabled: z.boolean().optional(),
  /** 是否包含已软删记录（软删除视图） */
  includeDeleted: z.boolean().optional(),
});

export type AdminAccountQuery = z.input<typeof AdminAccountQuerySchema>;

/** 管理端账户（列表项） */
export const AdminAccountSchema = z.object({
  accountId: z.string(),
  /** 登录标识（identityType=username 的 identifier） */
  username: z.string(),
  nickname: z.string(),
  email: z.string(),
  avatar: z.string(),
  enabled: z.boolean(),
  /** 角色机器编码列表 */
  roleCodes: z.array(z.string()),
  createdAt: z.iso.datetime(),
  /** 软删除时间（未删除为 null） */
  deletedAt: z.string().nullable(),
});

export type AdminAccount = z.infer<typeof AdminAccountSchema>;

/** 创建管理员入参 */
export const CreateAdminAccountSchema = z.object({
  username: z.string().min(3, '用户名至少 3 个字符').max(50, '用户名最多 50 个字符'),
  password: z.string().min(8, '密码至少 8 位').max(100, '密码最多 100 个字符'),
  nickname: z.string().max(50, '昵称最多 50 个字符').optional(),
  email: z.email().optional(),
  /** 至少绑定一个角色 */
  roleCodes: z.array(z.string().min(1)).min(1, '至少选择一个角色'),
});

export type CreateAdminAccountInput = z.input<typeof CreateAdminAccountSchema>;

/** 更新管理员入参（全字段可选） */
export const UpdateAdminAccountSchema = z.object({
  nickname: z.string().max(50, '昵称最多 50 个字符').optional(),
  email: z.email().optional(),
  enabled: z.boolean().optional(),
  roleCodes: z.array(z.string().min(1)).optional(),
});

export type UpdateAdminAccountInput = z.input<typeof UpdateAdminAccountSchema>;

/** 账户额外权限覆盖类型：grant 授权追加 / deny 禁止移除（对标老项目特例授权） */
export const AccountMenuTypeSchema = z.enum(['grant', 'deny']);

export type AccountMenuType = z.infer<typeof AccountMenuTypeSchema>;

/** 单条覆盖：menuId + 类型 */
export const AccountMenuOverrideSchema = z.object({
  menuId: z.string().min(1, 'menuId 不能为空'),
  type: AccountMenuTypeSchema,
});

export type AccountMenuOverride = z.infer<typeof AccountMenuOverrideSchema>;

/** 保存账户特例授权入参（全量覆盖） */
export const SaveAccountMenusSchema = z.object({
  items: z.array(AccountMenuOverrideSchema).default([]),
});

export type SaveAccountMenusInput = z.input<typeof SaveAccountMenusSchema>;

/** 账户特例授权结果：已有覆盖 + 角色基线菜单 id（只读展示） */
export const AccountMenusResultSchema = z.object({
  overrides: z.array(AccountMenuOverrideSchema),
  roleMenuIds: z.array(z.string()),
});

export type AccountMenusResult = z.infer<typeof AccountMenusResultSchema>;
