/**
 * TabBar Store — 标签页状态管理
 *
 * 参照 Arco Design Pro 的 tab-bar store：
 *   - tagList       → 已打开的标签页列表
 *   - cacheTabList  → keep-alive 的 include 列表
 *
 * 由 TabBar 组件通过 listenerRouteChange 订阅路由变化，自动新增标签。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RouteLocationNormalized } from 'vue-router';
import { DEFAULT_ROUTE_NAME, REDIRECT_ROUTE_NAME } from '@/app/router/constants';

// ---- 类型 ----
export interface TagProps {
    title: string;
    name: string;
    fullPath: string;
    query?: Record<string, unknown>;
    params?: Record<string, unknown>;
    ignoreCache?: boolean;
}

// ---- 不需要加入标签页的路由 ----
const BAN_LIST = [REDIRECT_ROUTE_NAME, 'ForbiddenPage', 'NotFoundPage', 'ServerErrorPage'];

// ---- 默认首页标签 ----
const HOME_TAG: TagProps = {
    title: '首页',
    name: DEFAULT_ROUTE_NAME,
    fullPath: '/',
};

// ---- 从路由对象提取标签信息 ----
function formatTag(route: RouteLocationNormalized): TagProps {
    return {
        title: (route.meta?.title as string) || (route.name as string) || '',
        name: String(route.name),
        fullPath: route.fullPath,
        query: route.query as Record<string, unknown>,
        params: route.params as Record<string, unknown>,
        ignoreCache: (route.meta?.ignoreCache as boolean) || false,
    };
}

// ---- Store ----
export const useTabBarStore = defineStore('tabBar', () => {
    const cacheTabList = ref<Set<string>>(new Set([DEFAULT_ROUTE_NAME]));
    const tagList = ref<TagProps[]>([HOME_TAG]);

    // ---- 新增标签（路由变化时调用） ----
    function updateTabList(route: RouteLocationNormalized) {
        const name = route.name as string;
        if (BAN_LIST.includes(name)) return;

        // 已存在相同 fullPath → 不重复添加
        if (tagList.value.some((tag) => tag.fullPath === route.fullPath)) return;

        // 如果当前路由通过 activeMenu 关联到某个菜单（如详情页关联到列表页），
        // 则在原菜单位置上原地替换标签，保留菜单 name 以保持激活态匹配
        const activeMenu = route.meta?.activeMenu as string | undefined;
        if (activeMenu) {
            const idx = tagList.value.findIndex((tag) => tag.name === activeMenu);
            if (idx >= 0) {
                const updated = formatTag(route);
                updated.name = activeMenu; // 保留菜单 name，单击标签时通过 fullPath 跳转
                tagList.value[idx] = updated;
                if (!route.meta?.ignoreCache) {
                    cacheTabList.value.add(name);
                }
                return;
            }
        }

        // 同名标签（如从详情页返回列表页）→ 原地更新
        const existingIdx = tagList.value.findIndex((tag) => tag.name === name);
        if (existingIdx >= 0) {
            tagList.value[existingIdx] = formatTag(route);
            return;
        }

        tagList.value.push(formatTag(route));

        // 不忽略缓存 → 加入 keep-alive include
        if (!route.meta?.ignoreCache) {
            cacheTabList.value.add(name);
        }
    }

    // ---- 删除标签 ----
    function deleteTag(idx: number, tag: TagProps) {
        tagList.value.splice(idx, 1);
        cacheTabList.value.delete(tag.name);
    }

    // ---- 添加缓存 ----
    function addCache(name: string) {
        if (name) cacheTabList.value.add(name);
    }

    // ---- 删除缓存 ----
    function deleteCache(name: string) {
        cacheTabList.value.delete(name);
    }

    // ---- 批量替换标签 ----
    function freshTabList(tags: TagProps[]) {
        tagList.value = tags;
        cacheTabList.value.clear();
        tags.filter((el) => !el.ignoreCache)
            .map((el) => el.name)
            .forEach((x) => cacheTabList.value.add(x));
    }

    // ---- 重置为初始状态 ----
    function resetTabList() {
        tagList.value = [HOME_TAG];
        cacheTabList.value = new Set([DEFAULT_ROUTE_NAME]);
    }

    return {
        cacheTabList,
        tagList,
        updateTabList,
        deleteTag,
        addCache,
        deleteCache,
        freshTabList,
        resetTabList,
    };
});
