<template>
    <n-breadcrumb
        class="bg-white! dark:bg-[#18181c]! px-(--gap) py-[calc(var(--gap)/2)] border-b border-gray-200 dark:border-gray-800"
    >
        <template v-for="item in breadcrumbs" :key="item.name">
            <n-breadcrumb-item :clickable="false">
                <n-icon v-if="item.icon" :component="item.icon" />
                {{ item.title }}
            </n-breadcrumb-item>
        </template>
    </n-breadcrumb>
</template>

<script setup lang="ts">
defineOptions({ name: 'NavBreadcrumb' });
import { computed } from 'vue';
import type { Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { resolveIcon } from '@/shared/utils/icon-resolver';

interface BreadcrumbItem {
    name: string;
    title: string;
    icon: Component | null;
}

const route = useRoute();
const router = useRouter();

function toBreadcrumbItems(
    matched: ReadonlyArray<{ name?: string | symbol; meta?: Record<string, unknown> }>,
): BreadcrumbItem[] {
    return matched
        .filter((r) => r.meta?.title)
        .map((r) => ({
            name: (r.name as string) || '',
            title: r.meta!.title as string,
            icon: resolveIcon(r.meta?.icon as string | undefined),
        }));
}

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = [];

    // 如果当前路由通过 activeMenu 关联到某个菜单路由，则先解析出菜单的完整面包屑路径
    const lastMatched = route.matched[route.matched.length - 1];
    const activeMenuName = lastMatched?.meta?.activeMenu as string | undefined;

    if (activeMenuName) {
        const resolved = router.resolve({ name: activeMenuName });
        items.push(...toBreadcrumbItems(resolved.matched));
    }

    // 再追加当前路由自身的面包屑
    items.push(...toBreadcrumbItems(route.matched));

    return items;
});
</script>
