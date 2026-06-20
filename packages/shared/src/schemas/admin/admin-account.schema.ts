import { z } from 'zod';
import { PaginationSchema, UuidSchema } from '../common.schema.js';

/**
 * 管理员密码复杂度（与 generateInitialPassword 保持一致的口径）
 * - 最小 8 位
 * - 必须同时包含字母和数字
 * - 不限制特殊字符（admin 自己生成强密码的场景居多，不做强制）
 */
const ADMIN_PASSWORD_MIN_LENGTH = 8;
const AdminPasswordBaseSchema = z
    .string()
    .min(ADMIN_PASSWORD_MIN_LENGTH, `密码至少 ${ADMIN_PASSWORD_MIN_LENGTH} 位`)
    .max(64, '密码最多 64 位')
    .refine((v) => /[A-Za-z]/.test(v), '密码必须包含至少一个字母')
    .refine((v) => /\d/.test(v), '密码必须包含至少一个数字');

/**
 * 创建管理员 Schema
 * - username: 必填
 * - nickname: 必填
 * - phone: 可选，中国大陆手机号
 * - email: 可选，邮箱格式
 * - roleIds: 可选，UUID 数组
 * - avatar: 可选，头像 URL（先调 /api/upload/avatar 拿服务端 URL 再传这里），最长 255 字符
 * - password: 可选，自定义初始密码
 *   - 不传 → 后端走 generateInitialPassword() 生成随机密码（前端通过 dialog 告知管理员）
 *   - 传了 → 校验通过后用此密码哈希入 accountIdentity.credential
 *   - 强度规则复用 AdminPasswordBaseSchema（8-64 位 + 字母 + 数字）
 */
export const CreateAdminAccountSchema = z
    .object({
        username: z.string().min(3, '用户名至少 3 个字符').max(50, '用户名最多 50 个字符'),
        nickname: z.string().min(1, '昵称不能为空').max(50, '昵称最多 50 个字符'),
        phone: z
            .string()
            .regex(/^1[3-9]\d{9}$/, '手机号格式错误')
            .optional(),
        email: z.string().email('邮箱格式错误').optional(),
        roleIds: z.array(UuidSchema).optional(),
        avatar: z.string().max(255, '头像 URL 最长 255 字符').optional(),
        password: AdminPasswordBaseSchema.optional(),
    })
    .strict();

/** 创建管理员输入类型 */
export type CreateAdminAccountInput = z.infer<typeof CreateAdminAccountSchema>;

/**
 * 更新管理员 Schema
 * - 基于 CreateAdminAccountSchema.partial()，复用验证规则
 * - 额外支持 enabled 字段（启用/禁用账户）
 * - avatar 传 '' 可显式清空头像（与 DB VARCHAR(255) 对齐）
 */
export const UpdateAdminAccountSchema = CreateAdminAccountSchema.partial()
    .extend({
        enabled: z.boolean().optional(),
    })
    .strict();

/** 更新管理员输入类型 */
export type UpdateAdminAccountInput = z.infer<typeof UpdateAdminAccountSchema>;

/**
 * 查询管理员 Schema
 * - 继承分页参数
 * - keyword: 可选，模糊搜索关键词
 * - enabled: 可选，启用状态筛选
 * - includeDeleted: 可选，是否包含已软删除的管理员（默认 false）
 *   - true 时返回所有行（含已软删的，deletedAt 非空）
 *   - false 时只返回活跃行（deletedAt IS NULL）
 */
export const QueryAdminAccountSchema = PaginationSchema.extend({
    keyword: z.string().max(100, '关键词最多 100 个字符').optional(),
    enabled: z.boolean().optional(),
    includeDeleted: z.boolean().optional().default(false),
}).strict();

/** 查询管理员输入类型 */
export type QueryAdminAccountInput = z.infer<typeof QueryAdminAccountSchema>;

/**
 * 分配管理员角色 Schema
 * - accountId: 必填，目标账户 ID
 * - roleIds: 必填，新的角色 ID 列表
 */
export const AssignAdminAccountRolesSchema = z
    .object({
        accountId: UuidSchema,
        roleIds: z.array(UuidSchema).min(0),
    })
    .strict();

/** 分配角色输入类型 */
export type AssignAdminAccountRolesInput = z.infer<typeof AssignAdminAccountRolesSchema>;

/**
 * 重置管理员密码 Schema
 * - newPassword: 新密码（必填，强度规则见文件顶部 AdminPasswordBaseSchema）
 * - confirmPassword: 确认密码（必填，必须与 newPassword 严格相等）
 *
 * 设计：
 * - 必须输两遍（避免管理员输错导致账号登不上去）
 * - 不要求传旧密码（重置场景通常意味着旧密码丢失/泄露）
 * - 权限码：iam:admin:update（重置密码与编辑共用权限码，避免部分成功的迷惑提示）
 */
export const ResetAdminPasswordSchema = z
    .object({
        newPassword: AdminPasswordBaseSchema,
        confirmPassword: z.string().min(1, '请再次输入新密码'),
    })
    .strict()
    .refine((v) => v.newPassword === v.confirmPassword, {
        message: '两次输入的密码不一致',
        path: ['confirmPassword'],
    });

/** 重置密码输入类型 */
export type ResetAdminPasswordInput = z.infer<typeof ResetAdminPasswordSchema>;
