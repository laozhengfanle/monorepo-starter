/**
 * 系统配置 GraphQL Resolver
 *
 * 旧 Query / Mutation（保留向后兼容）：
 * - systemConfigs: 配置列表
 * - systemConfig(key): 单个配置
 * - createSystemConfig / updateSystemConfig / deleteSystemConfig
 *
 * 新 Query / Mutation（前端 e5b1fd8 重构后使用）：
 * - adminConfigs: 完整管理字段 + JSON 对象值
 * - updateConfig(key, value: JSON!): 单条更新
 * - batchUpdateConfigs(updates): 批量更新
 *
 * 权限：
 * - config:admin:list / config:admin:create / config:admin:update / config:admin:delete
 */
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    CreateSystemConfigSchema,
    UpdateSystemConfigSchema,
    SystemConfigKeySchema,
    ConfigUpdateItemSchema,
    BatchUpdateConfigsSchema,
    type CreateSystemConfigInput,
    type UpdateSystemConfigInput,
    type BatchUpdateConfigsInput,
} from '@packages/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from '../../../common/guards/admin-permission.guard.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import { LoginOnly } from '../../../common/decorators/login-only.decorator.js';
import { ZodArgsPipe } from '../../../common/pipes/zod-args.pipe.js';
import { SystemConfig, AdminConfig } from './system-config.type.js';
import {
    CreateSystemConfigInput as CreateSystemConfigInputType,
    UpdateSystemConfigInput as UpdateSystemConfigInputType,
    BatchUpdateConfigsInputType,
    UpdateConfigInputType,
} from './system-config.input.js';
import { SystemConfigService } from './system-config.service.js';

@Resolver(() => SystemConfig)
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class SystemConfigResolver {
    constructor(private readonly configService: SystemConfigService) {}

    /**
     * @description 查询所有系统配置（按 key 升序）
     * @returns SystemConfig[] 完整配置列表
     * @example await resolver.systemConfigs()
     */
    @Query(() => [SystemConfig], { description: '查询所有系统配置（按 key 升序）' })
    @Permission('config:admin:view')
    async systemConfigs(): Promise<SystemConfig[]> {
        // 不再接收 group 参数：DB schema 没有 group 字段
        return this.configService.findAll();
    }

    /**
     * 查询单个系统配置
     * 注意：key 显式声明 nullable: false，与 schema.gql 中 key: String! 一致
     */
    @Query(() => SystemConfig, { description: '查询单个系统配置' })
    @Permission('config:admin:view')
    async systemConfig(
        @Args('key', { nullable: false }, new ZodArgsPipe(SystemConfigKeySchema)) key: string,
    ): Promise<SystemConfig> {
        return this.configService.findByKey(key);
    }

    /**
     * 管理端配置列表（新接口）
     * - 包含完整管理字段（id / remark / updatedBy / createdAt）
     * - value 是已解析的 JSON 对象（适配前端 ConfigRow.value: Record<string, unknown>）
     */
    @Query(() => [AdminConfig], { description: '管理端配置列表（完整字段 + JSON 对象值）' })
    @Permission('config:admin:view')
    async adminConfigs(): Promise<AdminConfig[]> {
        return this.configService.findAllAsAdmin();
    }

    /**
     * 公开配置列表（无需鉴权）
     * - 用于登录页/浏览器 title 等未登录场景的 UI 渲染
     * - 仅返回 PUBLIC_CONFIG_KEYS 白名单内的 key，敏感凭据（clientSecret/appSecret/secretKey 等）一律不暴露
     * - 安全提示：绝不能把含敏感字段的 key 加入白名单
     */
    @Public()
    @Query(() => [AdminConfig], {
        description: '公开配置（仅白名单 key，供未登录场景使用）',
    })
    async publicConfigs(): Promise<AdminConfig[]> {
        return this.configService.findPublic();
    }

    /**
     * 私有配置列表（需要登录 + config:admin:list 权限）
     * - 包含所有配置项（含敏感凭据），仅授权用户可见
     * - 与 adminConfigs 行为一致，但语义清晰"私有"
     * - 推荐新代码使用 privateConfigs（更显式地表达"需要鉴权"）
     */
    @RequireAuth()
    @Query(() => [AdminConfig], {
        description: '私有配置（需要登录 + config:admin:list 权限，含敏感凭据）',
    })
    @Permission('config:admin:view')
    async privateConfigs(): Promise<AdminConfig[]> {
        return this.configService.findPrivate();
    }

    /**
     * 当前管理员偏好设置（仅需登录，不需要 config:admin:view 权限）
     * - 登录后前端立刻调用 reloadAdminPreferences()，此时可能还没加载完整权限列表
     * - 用 @LoginOnly() 允许任何已登录管理员读取自己的偏好
     * - 返回 admin_preferences 单条配置（无则为 null）
     */
    @RequireAuth()
    @LoginOnly()
    @Query(() => AdminConfig, {
        nullable: true,
        description: '当前管理员偏好设置（仅需登录）',
    })
    async myPreferences(): Promise<AdminConfig | null> {
        return this.configService.findByKeyOrNull('admin_preferences');
    }

    /**
     * 创建系统配置
     * 注意：input 显式声明 nullable: false，与 schema.gql 中 input: CreateSystemConfigInput! 一致
     */
    @Mutation(() => SystemConfig, { description: '创建系统配置' })
    @Permission('config:admin:create')
    async createSystemConfig(
        @Args(
            'input',
            { type: () => CreateSystemConfigInputType, nullable: false },
            new ZodArgsPipe(CreateSystemConfigSchema),
        )
        input: CreateSystemConfigInput,
    ): Promise<SystemConfig> {
        return this.configService.create(input);
    }

    /**
     * 更新系统配置
     * 注意：key 和 input 都显式声明 nullable: false，与 schema.gql 一致
     */
    @Mutation(() => SystemConfig, { description: '更新系统配置' })
    @Permission('config:admin:update')
    async updateSystemConfig(
        @Args('key', { nullable: false }) key: string,
        @Args(
            'input',
            { type: () => UpdateSystemConfigInputType, nullable: false },
            new ZodArgsPipe(UpdateSystemConfigSchema),
        )
        input: UpdateSystemConfigInput,
    ): Promise<SystemConfig> {
        return this.configService.update(key, input);
    }

    /**
     * 单条更新配置（新接口）
     * - input: 必填，{ key, value(JSON 对象) }
     * - 返回更新后的完整 AdminConfig
     *
     * 说明：用 input 包裹 key + value 是因为 NestJS 不支持把 GraphQLJSON scalar
     *      作为顶层 @Args 的 type，必须用装饰过的 class
     */
    @Mutation(() => AdminConfig, { description: '单条更新配置（JSON 对象值）' })
    @Permission('config:admin:update')
    async updateConfig(
        @Args('input', { type: () => UpdateConfigInputType, nullable: false }) input: UpdateConfigInputType,
    ): Promise<AdminConfig> {
        // Zod 校验（service 还会再做一次类型检查，但 Zod 能给出更友好的错误消息）
        const parsed = ConfigUpdateItemSchema.parse({ key: input.key, value: input.value });
        return this.configService.updateOne(parsed.key, parsed.value);
    }

    /**
     * 批量更新配置（新接口）
     * - updates: 至少 1 条，每条 { key, value(JSON 对象) }
     * - 全部成功才返回；任一失败抛错
     */
    @Mutation(() => [AdminConfig], { description: '批量更新配置（事务式：全部成功或全部回滚提示）' })
    @Permission('config:admin:update')
    async batchUpdateConfigs(
        @Args(
            'input',
            { type: () => BatchUpdateConfigsInputType, nullable: false },
            new ZodArgsPipe(BatchUpdateConfigsSchema),
        )
        input: BatchUpdateConfigsInput,
    ): Promise<AdminConfig[]> {
        // 转换为 service 期望的格式
        const updates: { key: string; value: unknown }[] = input.updates.map((u) => ({
            key: u.key,
            value: u.value,
        }));
        return this.configService.batchUpdate(updates);
    }

    /**
     * 软删除系统配置
     * 注意：key 显式声明 nullable: false，与 schema.gql 中 key: String! 一致
     */
    @Mutation(() => Boolean, { description: '软删除系统配置' })
    @Permission('config:admin:delete')
    async deleteSystemConfig(
        @Args('key', { nullable: false }, new ZodArgsPipe(SystemConfigKeySchema)) key: string,
    ): Promise<boolean> {
        await this.configService.delete(key);
        return true;
    }
}
