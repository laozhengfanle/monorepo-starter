<template>
    <n-layout content-class="h-[100dvh]! flex flex-col">
        <LayoutHeader bordered />

        <n-layout has-sider class="flex-1">
            <n-layout-sider
                bordered
                show-trigger
                collapse-mode="width"
                :collapsed-width="64"
                :collapsed="isSiderCollapsed"
                @update:collapsed="isSiderCollapsed = $event"
            >
                <div v-if="sidebarLoading" class="p-(--gap)">
                    <n-skeleton :rows="8" />
                </div>
                <div v-else-if="sidebarError" class="p-(--gap)">
                    <n-empty description="加载失败" size="small" />
                </div>
                <div v-else-if="docMenuOptions.length === 0" class="p-(--gap)">
                    <n-empty description="暂无文档" size="small" />
                </div>
                <n-menu v-else :value="activeDocMenuKey" :options="docMenuOptions" @update:value="onDocMenuSelect" />
            </n-layout-sider>

            <!-- 内容区：纯 div 滚动容器，不嵌套 n-layout-content（避免 overflow:hidden 破坏 sticky） -->
            <div id="doc-scroll-container" class="flex-1 overflow-y-auto scroll-smooth">
                <div class="pb-(--gap) pr-(--gap) pt-(--gap) pl-(--gap) min-h-full">
                    <router-view v-slot="{ Component: ChildComp, route: slotRoute }">
                        <transition :name="transitionName" mode="out-in">
                            <component :is="ChildComp" :key="slotRoute.fullPath" />
                        </transition>
                    </router-view>
                </div>
                <!-- <LayoutFooter v-if="isFooterVisible" /> -->
            </div>
        </n-layout>

        <n-back-top :right="24" :bottom="24" />
    </n-layout>
</template>

<script setup lang="ts">
defineOptions({ name: 'DocLayout' });
import { ref, h, computed, watch, onMounted } from 'vue';
import type { Component } from 'vue';
import type { MenuOption } from 'naive-ui';
import { NIcon } from 'naive-ui';
import { File } from '@vicons/tabler';
import LayoutHeader from './components/LayoutHeader.vue';
import { useSettingsStore } from '@/shared/stores/settings';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useMediaQuery } from '@vueuse/core';
import { getDocsList } from '@/api/bff/docs';
import type { DocMeta } from '@/api/bff/docs';

const route = useRoute();
const router = useRouter();
const { isRouteAnimationEnabled, animationType } = storeToRefs(useSettingsStore());

const isSmallScreen = useMediaQuery('(max-width: 768px)');
const isSiderCollapsed = ref(false);
watch(
    isSmallScreen,
    (v) => {
        isSiderCollapsed.value = v;
    },
    { immediate: true },
);

const docsList = ref<DocMeta[]>([]);
const sidebarLoading = ref(true);
const sidebarError = ref<string | null>(null);

onMounted(async () => {
    try {
        docsList.value = await getDocsList();
        const currentSlug = route.params.slug as string | undefined;
        if (!currentSlug && docsList.value.length > 0) {
            router.replace({ name: 'DocPage', params: { slug: docsList.value[0].slug } });
        }
    } catch {
        sidebarError.value = '文档列表加载失败';
    } finally {
        sidebarLoading.value = false;
    }
});

function renderIcon(icon: Component) {
    return () => h(NIcon, null, { default: () => h(icon) });
}

const transitionName = computed(() => {
    if (!isRouteAnimationEnabled.value) return '';
    return `page-${animationType.value}`;
});

const docMenuOptions = computed<MenuOption[]>(() => {
    // 按 group 分组
    const groups = new Map<string, DocMeta[]>();
    for (const doc of docsList.value) {
        const g = doc.group || '';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(doc);
    }

    const options: MenuOption[] = [];
    const sortedGroups = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));

    for (const group of sortedGroups) {
        const docs = groups.get(group)!;
        const children: MenuOption[] = docs.map((doc) => ({
            label: doc.title,
            key: doc.slug,
            icon: renderIcon(File),
        }));

        if (group) {
            // 有分组 → 用 group type 展示
            options.push({
                type: 'group',
                label: group,
                key: `group-${group}`,
                children,
            });
        } else {
            // 无分组（根目录文件如 README）→ 直接追加
            options.push(...children);
        }
    }

    return options;
});

const activeDocMenuKey = computed(() => {
    const slug = route.params.slug as string | undefined;
    return slug ?? null;
});

function onDocMenuSelect(key: string) {
    router.push({ name: 'DocPage', params: { slug: key } });
}
</script>
