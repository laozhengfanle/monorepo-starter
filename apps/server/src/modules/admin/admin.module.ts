import { Module } from '@nestjs/common';
import { AdminRoleService } from './admin-role/admin-role.service.js';
import { AdminRoleController } from '../../bff/admin/roles/admin-role.controller.js';
import { AdminRoleResolver } from './admin-role/admin-role.resolver.js';
import { AdminMenuService } from './admin-menu/admin-menu.service.js';
import { AdminMenuController } from '../../bff/admin/menus/admin-menu.controller.js';
import { AdminMenuResolver } from './admin-menu/admin-menu.resolver.js';
import { AdminAccountService } from './admin-account/admin-account.service.js';
import { AdminAccountResolver } from './admin-account/admin-account.resolver.js';
import { AdminPermissionCacheService } from './admin-permission-cache.service.js';
import { AuditLogResolver } from './audit-log/audit-log.resolver.js';
import { AccountMenuResolver } from './account-menu/account-menu.resolver.js';
import { SystemConfigModule } from './system-config/system-config.module.js';
import { CacheController } from '../../bff/admin/cache/cache.controller.js';
import { ServicesModule } from '../../common/services/services.module.js';

/**
 * 管理端模块 — 聚合 RBAC 相关服务和控制器
 * - AdminAccountService / AdminAccountResolver：管理员账户 CRUD
 * - AdminRoleService / AdminRoleController / AdminRoleResolver：角色增删改查、菜单分配
 * - AdminMenuService / AdminMenuController / AdminMenuResolver：菜单增删改查、按角色查询
 * - AdminPermissionCacheService：权限缓存管理
 * - SystemConfigModule：系统配置
 */
@Module({
    imports: [
        SystemConfigModule,
        /**
         * 导入 ServicesModule（@Global）以使用 TokenBlacklistService
         * - admin-account.service.ts 软删 / 改密时调 revokeAccountTokens
         */
        ServicesModule,
    ],
    controllers: [AdminRoleController, AdminMenuController, CacheController],
    providers: [
        AdminRoleService,
        AdminRoleResolver,
        AdminMenuService,
        AdminMenuResolver,
        AdminAccountService,
        AdminAccountResolver,
        AuditLogResolver,
        AccountMenuResolver,
        AdminPermissionCacheService,
    ],
    exports: [AdminRoleService, AdminMenuService, AdminAccountService, AdminPermissionCacheService, SystemConfigModule],
})
export class AdminModule {}
