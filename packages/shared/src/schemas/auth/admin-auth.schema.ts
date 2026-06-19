import { z } from 'zod';

/**
 * 管理员登录 Schema
 * - username: 3-50 字符
 * - password: ≥8 位，必须包含字母和数字
 * - turnstileToken: Cloudflare Turnstile 一次性 token（可选）
 *   - 可选原因：开发环境 / 关闭 Turnstile 时前端不渲染 widget，token 字段缺省
 *   - 后端 TurnstileService.verify() 内部根据 system_config.turnstile.config.enabled
 *     决定是否强校验：未传 + enabled=true → 20007；未传 + enabled=false → 跳过
 */
export const AdminLoginSchema = z
    .object({
        username: z.string().min(3, '用户名至少 3 个字符').max(50, '用户名最多 50 个字符'),
        password: z
            .string()
            .min(8, '密码至少 8 位')
            .regex(/[a-zA-Z]/, '密码必须包含字母')
            .regex(/[0-9]/, '密码必须包含数字'),
        turnstileToken: z.string().min(1).optional(),
    })
    .strict();

/** 管理员登录输入类型 */
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
