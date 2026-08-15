import { z } from 'zod';
import { AdminMenuNodeSchema } from './admin-menu.js';

/** 登录请求（管理端：用户名 + 密码） */
export const LoginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(50, '用户名最多 50 个字符'),
  password: z.string().min(8, '密码至少 8 位').max(100, '密码最多 100 个字符'),
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
  /** 角色机器编码列表，如 ['super_admin'] */
  roleCodes: z.array(z.string()),
  /** 聚合的权限点列表（角色 → AdminMenu.code），如 ['user:create'] */
  permissions: z.array(z.string()),
  /** 可访问的菜单树（侧栏渲染；按 sort 升序，已裁剪无权限分支） */
  menus: z.array(AdminMenuNodeSchema),
});

export type AdminMe = z.infer<typeof AdminMeSchema>;
