import { z } from 'zod';

/**
 * Token 刷新 Schema
 * - refreshToken: 刷新令牌字符串
 */
export const TokenRefreshSchema = z
    .object({
        refreshToken: z.string().min(1, '刷新令牌不能为空'),
    })
    .strict();

/** Token 刷新输入类型 */
export type TokenRefreshInput = z.infer<typeof TokenRefreshSchema>;

/**
 * 登出 Schema
 * - 无参数，使用空对象可选
 */
export const LogoutSchema = z.object({}).optional();

/**
 * 修改密码 Schema
 * - oldPassword: 旧密码
 * - newPassword: 新密码（≥8 位，必须包含字母和数字，不能与旧密码相同）
 */
export const ChangePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, '旧密码不能为空'),
        newPassword: z
            .string()
            .min(8, '新密码至少 8 位')
            .regex(/[a-zA-Z]/, '新密码必须包含字母')
            .regex(/[0-9]/, '新密码必须包含数字'),
    })
    .strict()
    .refine((data) => data.oldPassword !== data.newPassword, {
        message: '新密码不能与旧密码相同',
        path: ['newPassword'],
    });

/** 修改密码输入类型 */
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
