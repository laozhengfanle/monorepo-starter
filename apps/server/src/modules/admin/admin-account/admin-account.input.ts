/**
 * 管理端账户 GraphQL InputType
 *
 * 设计：
 * - 字段定义与 packages/shared/schemas/admin/admin-account.schema.ts 保持一致
 * - Zod Schema 在 resolver 层用 ZodArgsPipe 验证，GraphQL Schema 仅做类型提示
 */
import { Field, ID, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CreateAdminAccountInput {
    @Field()
    username!: string;

    @Field()
    nickname!: string;

    @Field(() => String, { nullable: true })
    phone?: string;

    @Field(() => String, { nullable: true })
    email?: string;

    @Field(() => [ID], { nullable: true, description: '初始分配的角色 ID 列表' })
    roleIds?: string[];

    /**
     * 头像 URL（选填）
     * - 约定：上传走 POST /api/admin/uploads/avatar，拿回 { url: "/uploads/avatars/xxx.webp" } 后塞这里
     * - 也允许外部 CDN / 相对路径，但服务端不做格式校验（基座原则：字符串透传）
     */
    @Field(() => String, { nullable: true, description: '头像 URL，建议先调用上传接口获取服务端 URL' })
    avatar?: string;

    /**
     * 初始密码（可选，8-64 位 + 字母 + 数字）
     * - 传了：使用入参的明文（已由 Zod 强度校验）
     * - 不传：后端走 generateInitialPassword() 生成 12 位强密码
     * - 警告：必须声明这个字段！否则 NestJS GraphQL 会静默丢弃未声明字段，
     *   导致前端以为自己传的密码落库了，实际落库的是后端随机生成的，
     *   引发"前后端密码不一致"问题。
     */
    @Field(() => String, { nullable: true, description: '初始密码（可选，8-64 位 + 字母 + 数字）' })
    password?: string;
}

@InputType()
export class UpdateAdminAccountInput {
    @Field(() => String, { nullable: true })
    nickname?: string;

    @Field(() => String, { nullable: true })
    phone?: string;

    @Field(() => String, { nullable: true })
    email?: string;

    @Field(() => Boolean, { nullable: true })
    enabled?: boolean;

    @Field(() => [ID], { nullable: true, description: '重新分配的角色 ID 列表（不传则不修改）' })
    roleIds?: string[];

    /**
     * 头像 URL（选填，传 '' 表示清空头像，传 URL 字符串表示替换头像）
     * - 不传：保留原头像
     * - 传 ''：清空头像（回退到 User icon 占位）
     * - 传 URL：替换为新头像（建议先调 /api/admin/uploads/avatar 拿到服务端 URL）
     */
    @Field(() => String, { nullable: true, description: '头像 URL，传空字符串表示清空，不传表示保留' })
    avatar?: string;
}

@InputType()
export class QueryAdminAccountInput {
    @Field(() => Int, { defaultValue: 1 })
    page!: number;

    @Field(() => Int, { defaultValue: 20 })
    pageSize!: number;

    @Field(() => String, { nullable: true })
    keyword?: string;

    @Field(() => Boolean, { nullable: true })
    enabled?: boolean;

    /**
     * 是否包含已软删除的账户（默认 false）
     * - true 时返回所有行（含已软删的，deletedAt 非空）
     * - false 时只返回活跃行（deletedAt IS NULL）
     */
    @Field(() => Boolean, { nullable: true, defaultValue: false })
    includeDeleted?: boolean;
}

@InputType()
export class AssignAdminAccountRolesInput {
    @Field(() => ID)
    accountId!: string;

    @Field(() => [ID])
    roleIds!: string[];
}

/**
 * 重置管理员密码的 GraphQL InputType
 *
 * 字段：
 * - newPassword: 新密码（前端用 NInput.Password type="password" 录入）
 * - confirmPassword: 确认密码（前端要做"再次输入"提示）
 *
 * 校验：
 * - 字段类型/范围由 NestJS GraphQL 在解析时给出，复杂度+一致性由 ResetAdminPasswordSchema 统一保证
 * - 不传 oldPassword：重置场景通常意味着旧密码已丢
 */
@InputType({ description: '重置管理员密码的入参（前端必须做"再次输入"校验）' })
export class ResetAdminAccountPasswordInput {
    @Field(() => String, { description: '新密码，至少 8 位且必须同时包含字母和数字' })
    newPassword!: string;

    @Field(() => String, { description: '确认密码，必须与 newPassword 严格相等' })
    confirmPassword!: string;
}
