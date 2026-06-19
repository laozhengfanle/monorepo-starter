<template>
    <n-layout content-class="h-[100vh]! flex flex-col">
        <LayoutHeader bordered />

        <n-layout has-sider class="flex-1">
            <!-- 侧边栏 -->
            <LayoutSidebar />

            <!-- 内容区域 -->
            <n-layout-content class="h-full bg-transparent!" content-class="h-full flex flex-col">
                <!-- 选项卡（设置中可关闭） -->
                <TabBar v-if="isTabBarVisible" />

                <!-- 面包屑导航（设置中可关闭） -->
                <NavBreadcrumb v-if="isBreadcrumbVisible" />

                <!-- 内容区域（keep-alive 由 TabBar store 控制） -->
                <n-layout class="content-area h-full flex-1" content-class="h-full flex flex-col">
                    <n-layout-content
                        class="bg-transparent! flex-auto! overflow-visible!"
                        :content-class="`h-full flex flex-col ${isFooterVisible ? 'pb-0' : 'pb-(--gap)'} pr-(--gap) pt-(--gap) pl-(--gap)`"
                    >
                        <router-view v-slot="{ Component, route: slotRoute }">
                            <div class="page-transition-wrapper">
                                <transition :name="transitionName" appear>
                                    <div :key="slotRoute.fullPath" class="h-full">
                                        <keep-alive :include="cacheList">
                                            <component :is="Component" :key="slotRoute.fullPath" />
                                        </keep-alive>
                                    </div>
                                </transition>
                            </div>
                        </router-view>
                    </n-layout-content>

                    <!-- 页脚（设置中可关闭） -->
                    <LayoutFooter v-if="isFooterVisible" class="mt-auto" />

                    <!-- 回到顶部按钮 -->
                    <n-back-top :right="24" :bottom="24" />
                </n-layout>
            </n-layout-content>
        </n-layout>
    </n-layout>
</template>

<script setup lang="ts">
defineOptions({ name: 'MainLayout' });
import LayoutFooter from './components/LayoutFooter.vue';
import LayoutHeader from './components/LayoutHeader.vue';
import LayoutSidebar from './components/LayoutSidebar.vue';
import TabBar from './components/TabBar.vue';
import NavBreadcrumb from './components/NavBreadcrumb.vue';
import { useSettingsStore } from '@/shared/stores/settings';
import { useConfigStore } from '@/shared/stores/config';
import { useTabBarStore } from '@/shared/stores/tabBar';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const { isTabBarVisible, isFooterVisible, isBreadcrumbVisible, isRouteAnimationEnabled, animationType } =
    storeToRefs(useSettingsStore());
const tabBarStore = useTabBarStore();
const configStore = useConfigStore();

/**
 * keep-alive 的 include 列表，受 keepAliveMax 限制。
 * - keepAliveMax = 0：不缓存任何页面（返回空数组）
 * - keepAliveMax > 0：只保留最近打开的 N 个可缓存页面
 * - 淘汰策略：FIFO（最早打开的页面先被淘汰）
 */
const cacheList = computed(() => {
    const max = configStore.uiConfig.keepAliveMax;
    if (max === 0) return [];
    const all = [...tabBarStore.cacheTabList];
    if (max >= all.length) return all;
    // 保留最后 max 个（最近打开的）
    return all.slice(-max);
});

/**
 * 根据个人偏好动态生成 Transition 组件的 name。
 * 当 enableRouteAnimation 关闭时返回空字符串，Transition 退化为无动画。
 */
const transitionName = computed(() => {
    if (!isRouteAnimationEnabled.value) return '';
    return `page-${animationType.value}`;
});
</script>

<style scoped>
/* 明亮模式下内容区域加一层浅浅的底色 */
html:not(.dark) .content-area {
    background-color: #f5f6f8;
}
</style>
