import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { AdminRoleService } from '../../../modules/admin/admin-role/admin-role.service.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import {
    UuidSchema,
    CreateAdminRoleSchema,
    UpdateAdminRoleSchema,
    AssignRoleMenusSchema,
    type CreateAdminRoleInput,
    type UpdateAdminRoleInput,
    type AssignRoleMenusInput,
} from '@packages/shared';

/**
 * 管理端角色控制器
 * - 角色增删改查、菜单分配
 * - @RequireAuth() 标记进入权限保护模式，所有方法必须有 @Permission()
 * - 角色变更后自动失效相关缓存
 */
@Controller('admin/roles')
@RequireAuth()
export class AdminRoleController {
    private readonly logger = new Logger(AdminRoleController.name);

    constructor(private readonly roleService: AdminRoleService) {}

    /**
     * 查询所有角色
     * - enabled：可选启用状态筛选（默认不过滤）
     *   - "true"  → enabled=true
     *   - "false" → enabled=false
     *   - 缺省/空 → undefined（不过滤）
     */
    @Permission('iam:role:view')
    @Get()
    async findAll(@Query('enabled') enabled?: string) {
        const enabledFlag =
            enabled === 'true' || enabled === '1' ? true : enabled === 'false' || enabled === '0' ? false : undefined;
        const roles = await this.roleService.findAll(enabledFlag);
        return { code: 0, message: 'ok', data: roles };
    }

    /** 查询单个角色（含菜单列表） */
    @Permission('iam:role:view')
    @Get(':id')
    async findById(@Param('id', new ZodValidationPipe(UuidSchema)) id: string) {
        const role = await this.roleService.findById(id);
        return { code: 0, message: 'ok', data: role };
    }

    /** 创建角色 */
    @Permission('iam:role:create')
    @Post()
    async create(@Body(new ZodValidationPipe(CreateAdminRoleSchema)) dto: CreateAdminRoleInput) {
        const role = await this.roleService.create(dto);
        return { code: 0, message: 'ok', data: role };
    }

    /** 更新角色 */
    @Permission('iam:role:update')
    @Patch(':id')
    async update(
        @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
        @Body(new ZodValidationPipe(UpdateAdminRoleSchema)) dto: UpdateAdminRoleInput,
    ) {
        const role = await this.roleService.update(id, dto);
        return { code: 0, message: 'ok', data: role };
    }

    /** 删除角色（硬删除） */
    @Permission('iam:role:delete')
    @Delete(':id')
    async delete(@Param('id', new ZodValidationPipe(UuidSchema)) id: string) {
        const role = await this.roleService.delete(id);
        return { code: 0, message: 'ok', data: role };
    }

    /** 分配角色菜单（事务：先删后插） */
    @Permission('iam:role:update')
    @Post(':id/menus')
    async assignMenus(
        @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
        @Body(new ZodValidationPipe(AssignRoleMenusSchema)) dto: AssignRoleMenusInput,
    ) {
        /** Service 内已实现：事务 + 失效角色缓存 + 写审计日志 */
        const result = await this.roleService.assignMenus(id, dto.menuIds);
        return { code: 0, message: 'ok', data: result };
    }

    /** 获取持有该角色的账户 ID 列表 */
    @Permission('iam:role:view')
    @Get(':id/accounts')
    async getRoleAccounts(@Param('id', new ZodValidationPipe(UuidSchema)) id: string) {
        const accountIds = await this.roleService.getRoleAccounts(id);
        return { code: 0, message: 'ok', data: accountIds };
    }
}
