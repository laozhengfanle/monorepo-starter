/**
 * C端用户模块
 * - 聚合 member-role、member-menu、member-profile 三个子服务
 * - 供 MemberPermissionGuard 和 MeService 使用
 * - 导出所有子服务，其他模块可按需注入
 * - 包含测试控制器（仅开发/测试环境注入；生产环境不出现在路由表中）
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { MemberRoleService } from './member-role/member-role.service.js';
import { MemberMenuService } from './member-menu/member-menu.service.js';
import { MemberProfileService } from './member-profile/member-profile.service.js';
import { MemberTestController } from './member-test/member-test.controller.js';

@Module({})
export class MemberModule {
    /**
     * 动态注册：仅在非 production 环境加载 MemberTestController
     * - 生产环境：路由表里根本没有 /member/test/*，404 更彻底
     * - 开发/测试环境：正常注册，供权限守卫自测
     *
     * 设计权衡：
     * - 之前用 DevOnlyGuard 在 runtime 拦截（生产 404）
     * - 缺点：路由仍会注册 + Controller 仍会实例化 + 多一道 guard 调用
     * - 现在改成模块级剔除：生产环境从 root module config 就跳过，路由根本不创建
     * - 保留 DevOnlyGuard 作为深度防御（如果有人误改环境变量也能兜底）
     */
    static forRoot(): DynamicModule {
        const isProduction = process.env['NODE_ENV'] === 'production';
        return {
            module: MemberModule,
            controllers: isProduction ? [] : [MemberTestController],
            providers: [MemberRoleService, MemberMenuService, MemberProfileService],
            exports: [MemberRoleService, MemberMenuService, MemberProfileService],
        };
    }
}
