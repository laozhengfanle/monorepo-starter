import { z } from 'zod';

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
