import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'member']);

export const userStatusSchema = z.enum(['active', 'disabled', 'locked']);

/** 无默认值的基础字段（Update 的 partial 基于它，避免默认值泄漏进更新语义） */
const userFieldsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, '用户名至少 3 个字符')
    .max(30, '用户名最多 30 个字符'),
  email: z.email(),
  role: userRoleSchema,
  status: userStatusSchema,
});

/** 创建用户请求：role/status 缺省时应用默认值 */
export const CreateUserSchema = userFieldsSchema.extend({
  role: userRoleSchema.default('member'),
  status: userStatusSchema.default('active'),
});

/** 更新用户请求：全部字段可选且不应用默认值，复用 Create 的校验规则 */
export const UpdateUserSchema = userFieldsSchema.partial();

/** 用户视图对象（出参，不暴露内部字段） */
export const UserVoSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1),
  email: z.email(),
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: z.iso.datetime(),
});

export type UserVo = z.infer<typeof UserVoSchema>;
export type CreateUserInput = z.input<typeof CreateUserSchema>;
export type UpdateUserInput = z.input<typeof UpdateUserSchema>;
