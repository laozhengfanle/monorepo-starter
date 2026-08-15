import { z } from 'zod';
import { AdminMenuNodeSchema } from './admin-menu.js';

/** 登录请求（管理端：用户名 + 密码） */
export const LoginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(50, '用户名最多 50 个字符'),
  password: z.string().min(8, '密码至少 8 位').max(100, '密码最多 100 个字符'),
  /** Cloudflare Turnstile 人机验证 token（启用 Turnstile 时必填） */
  turnstileToken: z.string().optional(),
});

export type LoginInput = z.input<typeof LoginSchema>;

/** 登录成功返回（双 token） */
export const AuthResultSchema = z.object({
  accessToken: z.string(),
  /** refresh token（7 天），前端应存 httpOnly cookie 或安全存储 */
  refreshToken: z.string(),
  /** access token 过期时间（秒） */
  expiresIn: z.number().int().positive(),
});

export type AuthResult = z.infer<typeof AuthResultSchema>;

/** refresh 请求入参 */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken 不能为空'),
});

export type RefreshInput = z.input<typeof RefreshSchema>;

/** 管理端当前用户信息（me 查询返回） */
export const AdminMeSchema = z.object({
  accountId: z.string(),
  username: z.string(),
  nickname: z.string(),
  avatar: z.string(),
  email: z.string(),
  phone: z.string(),
  /** 账户创建时间（ISO） */
  createdAt: z.string(),
  /** 角色机器编码列表，如 ['super_admin'] */
  roleCodes: z.array(z.string()),
  /** 聚合的权限点列表（角色 → AdminMenu.code），如 ['user:create'] */
  permissions: z.array(z.string()),
  /** 可访问的菜单树（侧栏渲染；按 sort 升序，已裁剪无权限分支） */
  menus: z.array(AdminMenuNodeSchema),
});

export type AdminMe = z.infer<typeof AdminMeSchema>;

/** 个人中心：更新自己的资料（全字段可选，仅本人可调） */
export const UpdateSelfSchema = z.object({
  nickname: z.string().min(2, '昵称长度 2-32 个字符').max(32, '昵称长度 2-32 个字符').optional(),
  email: z
    .string()
    .max(100, '邮箱最多 100 个字符')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), '邮箱格式不正确')
    .optional(),
  phone: z
    .string()
    .max(20, '手机号最多 20 个字符')
    .refine((v) => v === '' || /^1[3-9]\d{9}$/.test(v), '手机号格式不正确')
    .optional(),
  /** 头像 URL（由 /upload 上传后回填） */
  avatar: z.string().max(255, '头像地址过长').optional(),
});

export type UpdateSelfInput = z.input<typeof UpdateSelfSchema>;

/** 个人中心：修改密码 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码不能为空').max(100, '当前密码过长'),
  newPassword: z.string().min(8, '新密码至少 8 位').max(100, '新密码最多 100 个字符'),
});

export type ChangePasswordInput = z.input<typeof ChangePasswordSchema>;
