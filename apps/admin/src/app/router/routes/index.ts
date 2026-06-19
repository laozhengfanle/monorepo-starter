import type { RouteRecordRaw } from 'vue-router';
import type { ExternalMenu } from '@/app/router/menu-to-routes';

/** 自动收集 modules/ 下所有 .ts 路由文件，新增模块无需手动 import */
const modules = import.meta.glob<{
    default: RouteRecordRaw | RouteRecordRaw[];
}>('./modules/*.ts', { eager: true });

/** 自动收集 external-modules/ 下所有 .ts 外部链接文件 */
const extModules = import.meta.glob<{
    default: ExternalMenu | ExternalMenu[];
}>('./external-modules/*.ts', { eager: true });

function collectRoutes(source: Record<string, { default: RouteRecordRaw | RouteRecordRaw[] }>): RouteRecordRaw[] {
    const result: RouteRecordRaw[] = [];
    Object.values(source).forEach((mod) => {
        const route = mod.default;
        if (!route) return;
        if (Array.isArray(route)) {
            result.push(...route);
        } else {
            result.push(route);
        }
    });
    return result;
}

function collectExternalMenus(source: Record<string, { default: ExternalMenu | ExternalMenu[] }>): ExternalMenu[] {
    const result: ExternalMenu[] = [];
    Object.values(source).forEach((mod) => {
        const menu = mod.default;
        if (!menu) return;
        if (Array.isArray(menu)) {
            result.push(...menu);
        } else {
            result.push(menu);
        }
    });
    return result;
}

/** 所有业务路由（已展开为一维数组） */
export const appRoutes: RouteRecordRaw[] = collectRoutes(modules);

/** 所有静态外部链接菜单 */
export const appExternalMenus: ExternalMenu[] = collectExternalMenus(extModules);
