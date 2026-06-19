/**
 * DataLoader 模块聚合
 *
 * 集中管理三类 N+1 修复 loader：
 * - MenuDataLoader：按 parentId 批量查子菜单
 * - RoleDataLoader：按 accountId 批量查角色
 * - PermissionDataLoader：按 accountId 批量查权限码
 *
 * 三者统一通过 buildDataLoaders(prisma) 工厂方法构建，返回的对象挂到 GraphQL context.dataloaders
 * 上，每个请求独立实例（REQUEST scope，NestJS + Apollo 集成语义）。
 */
import type { PrismaService } from '../prisma/prisma.service.js';
import { MenuDataLoader } from './menu.dataloader.js';
import { RoleDataLoader } from './role.dataloader.js';
import { PermissionDataLoader } from './permission.dataloader.js';

/** 注入到 GraphQL context 的 dataloaders 容器（按需扩展） */
export interface DataLoaders {
    /** 按 parentId 批量查子菜单 */
    menuByParentId: MenuDataLoader;
    /** 按 accountId 批量查角色（含 admin/member 通用结构） */
    rolesByAccountId: RoleDataLoader;
    /** 按 accountId 批量查权限码（去重 + 排序后的 string[]） */
    permissionsByAccountId: PermissionDataLoader;
}

/**
 * 工厂：为单次 GraphQL 请求构建一组新的 DataLoader 实例
 * - 调用方：GraphQLModule 的 context 工厂
 * - 每个请求独立 → 避免 loader 跨请求缓存污染
 * - 接收 prisma 用于 loader 内部构造批量查询
 */
export function buildDataLoaders(prisma: PrismaService): DataLoaders {
    return {
        menuByParentId: new MenuDataLoader(prisma),
        rolesByAccountId: new RoleDataLoader(prisma),
        permissionsByAccountId: new PermissionDataLoader(prisma),
    };
}

// Re-export 公共类型，便于 resolver / service 引用
// 类型只在外部需要时再 export，这里用 inline 注释说明可用导出
// export type { MenuChildNode } from './menu.dataloader.js';
// export type { AccountRoles } from './role.dataloader.js';
// export type { AccountPermissions } from './permission.dataloader.js';
