import { Controller, Get, Post, Patch, Delete, Body, Param, Logger } from '@nestjs/common';
import { AdminMenuService } from '../../../modules/admin/admin-menu/admin-menu.service.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import { buildMenuTree } from '../../../common/utils/build-menu-tree.js';
import {
    UuidSchema,
    CreateAdminMenuSchema,
    UpdateAdminMenuSchema,
    type CreateAdminMenuInput,
    type UpdateAdminMenuInput,
} from '@packages/shared';

/**
 * 管理端菜单控制器
 * - 菜单增删改查
 * - @RequireAuth() 标记进入权限保护模式，所有方法必须有 @Permission()
 * - 菜单结构变更后自动失效相关缓存
 */
@Controller('admin/menus')
@RequireAuth()
export class AdminMenuController {
    private readonly logger = new Logger(AdminMenuController.name);

    constructor(private readonly menuService: AdminMenuService) {}

    /** 查询完整菜单树（返回树形结构） */
    @Permission('iam:menu:view')
    @Get()
    async findTree() {
        const flatMenus = await this.menuService.findAll();
        const tree = buildMenuTree(
            flatMenus.map((m) => ({
                id: m.id,
                parentId: m.parentId ?? null,
                name: m.name,
                type: m.type,
                path: m.path,
                routeName: m.routeName,
                icon: m.icon,
                permissionCode: m.permissionCode,
                sort: m.sort,
                visible: m.visible,
                keepAlive: m.keepAlive,
                enabled: m.enabled,
            })),
        );
        return { code: 0, message: 'ok', data: tree };
    }

    /** 查询单个菜单 */
    @Permission('iam:menu:view')
    @Get(':id')
    async findById(@Param('id', new ZodValidationPipe(UuidSchema)) id: string) {
        const menu = await this.menuService.findById(id);
        return { code: 0, message: 'ok', data: menu };
    }

    /** 创建菜单 */
    @Permission('iam:menu:create')
    @Post()
    async create(@Body(new ZodValidationPipe(CreateAdminMenuSchema)) dto: CreateAdminMenuInput) {
        /** Service 内已实现：创建 + 失效缓存 + 写审计日志 */
        const menu = await this.menuService.create(dto);
        return { code: 0, message: 'ok', data: menu };
    }

    /** 更新菜单 */
    @Permission('iam:menu:update')
    @Patch(':id')
    async update(
        @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
        @Body(new ZodValidationPipe(UpdateAdminMenuSchema)) dto: UpdateAdminMenuInput,
    ) {
        /** Service 内已实现：更新 + 失效缓存 + 写审计日志 */
        const menu = await this.menuService.update(id, dto);
        return { code: 0, message: 'ok', data: menu };
    }

    /** 删除菜单（硬删除，不可恢复） */
    @Permission('iam:menu:delete')
    @Delete(':id')
    async delete(@Param('id', new ZodValidationPipe(UuidSchema)) id: string) {
        /** Service 内已实现：检查子节点 + 清理关联表 + 物理删除 + 失效缓存 + 写审计日志 */
        const result = await this.menuService.delete(id);
        return { code: 0, message: 'ok', data: result };
    }
}
