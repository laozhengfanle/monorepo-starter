<template>
    <!--
        Header.vue — 全局顶部导航栏

        职责：
        - 显示 Logo 与产品名称
        - 主题切换下拉菜单（亮色 / 暗色 / 跟随系统）
        - 全屏切换按钮（仅主布局）
        - 设置按钮 → 打开右侧 Settings 抽屉（仅主布局）

        Props:
        - mode: "main"（默认）显示完整操作区；"guest" 隐藏全屏和设置按钮
        - bordered: 是否显示底部边框，透传至 <n-layout-header>
    -->
    <n-layout-header class="flex flex-row items-center px-(--gap)" :bordered="bordered">
        <div class="flex-1 flex flex-row items-center justify-between h-16">
            <!-- ===== 左侧：Logo + 标题 ===== -->
            <div class="flex-1 flex items-center h-16">
                <component
                    :is="showActions ? 'router-link' : 'span'"
                    :to="showActions ? { name: 'DashboardWelcomePage' } : undefined"
                    class="header-brand"
                    :class="{ 'header-brand--clickable': showActions }"
                    :data-theme="isDark ? 'dark' : 'light'"
                >
                    <img :src="appLogo || '/hero.png'" alt="logo" class="header-logo" />
                    <h1 class="text-xl header-title">{{ appTitle }}</h1>
                </component>
            </div>

            <!-- ===== 右侧：操作按钮组 ===== -->
            <n-space>
                <!-- 主题切换 -->
                <n-dropdown trigger="click" :options="themeOptions" @select="onThemeSelect">
                    <n-button circle class="header-action-btn" aria-label="切换主题">
                        <template #icon>
                            <n-icon>
                                <Sun v-if="themeName === 'light'" />
                                <Moon v-else-if="themeName === 'dark'" />
                                <DeviceDesktop v-else />
                            </n-icon>
                        </template>
                    </n-button>
                </n-dropdown>

                <!-- 全屏切换（仅主布局） -->
                <n-button
                    v-if="showActions"
                    circle
                    class="header-action-btn"
                    aria-label="切换全屏"
                    @click="toggleFullscreen"
                >
                    <template #icon>
                        <n-icon>
                            <Maximize v-if="!isFullscreen" />
                            <Minimize v-else />
                        </n-icon>
                    </template>
                </n-button>

                <!-- 设置（仅主布局） -->
                <n-button
                    v-if="showActions"
                    circle
                    class="header-action-btn"
                    aria-label="应用设置"
                    @click="isSettingsDrawerOpen = true"
                >
                    <template #icon>
                        <n-icon><SettingOutlined /></n-icon>
                    </template>
                </n-button>
            </n-space>
        </div>

        <!-- ===== 设置抽屉 ===== -->
        <AppSettings v-model:show="isSettingsDrawerOpen" />
    </n-layout-header>
</template>

<script setup lang="ts">
defineOptions({ name: 'LayoutHeader' });
import { h, computed, ref } from 'vue';
import { NIcon } from 'naive-ui';
import type { DropdownOption } from 'naive-ui';
import { Sun, Moon, DeviceDesktop, Maximize, Minimize } from '@vicons/tabler';
import { SettingOutlined } from '@vicons/antd';
import { darkTheme } from 'naive-ui';
import { useSettingsStore } from '@/shared/stores/settings';
import { storeToRefs } from 'pinia';
import { useFullscreen } from '@vueuse/core';
import AppSettings from '@/app/components/AppSettings.vue';

import { useConfigStore } from '@/shared/stores/config';

// ---- 应用标题（优先使用后端配置，回退到环境变量） ----
const configStore = useConfigStore();
const appTitle = computed(() => configStore.systemBasic.name || import.meta.env.VITE_APP_TITLE);
const appLogo = computed(() => configStore.systemBasic.logo);

// ---- Props ----
const props = withDefaults(
    defineProps<{
        /** 布局模式：main（默认）= 显示完整操作区；guest = 仅显示主题切换 */
        mode?: 'guest' | 'main';
        /** 是否显示底部边框，透传至 <n-layout-header> */
        bordered?: boolean;
    }>(),
    {
        mode: 'main',
        bordered: false,
    },
);

// ---- 是否显示操作按钮（全屏 + 设置） ----
const showActions = computed(() => props.mode === 'main');

// ---- 设置抽屉可见性 ----
const isSettingsDrawerOpen = ref(false);

// ---- 主题 ----
const settings = useSettingsStore();
const { themeName, resolvedTheme, primaryColor } = storeToRefs(settings);
const isDark = computed(() => resolvedTheme.value === darkTheme);

/** 处理下拉菜单的主题选择 */
function onThemeSelect(key: string) {
    settings.setTheme(key as 'light' | 'dark' | 'auto');
}

// ---- 全屏（VueUse 封装，自动处理事件与兼容性） ----
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

// ---- 下拉菜单选项 ----
// 渲染带选中态颜色的图标：当前选中项的 icon 也跟随主色
function renderIcon(icon: typeof DeviceDesktop, key: string): () => ReturnType<typeof h> {
    return () => {
        const isActive = themeName.value === key;
        return h(NIcon, isActive ? { color: primaryColor.value } : null, {
            default: () => h(icon),
        });
    };
}

// 当前选中项的 label 通过 h() 渲染并附加主题色 ✓ 标记，避免字符串拼接的样式问题
function renderActiveLabel(label: string, key: string): () => ReturnType<typeof h> {
    return () => {
        const isActive = themeName.value === key;
        return h('span', isActive ? { style: { color: primaryColor.value } } : {}, isActive ? `${label} ✓` : label);
    };
}

const themeOptions = computed<DropdownOption[]>(() => [
    {
        key: 'auto',
        icon: renderIcon(DeviceDesktop, 'auto'),
        label: renderActiveLabel('跟随系统', 'auto'),
    },
    {
        key: 'light',
        icon: renderIcon(Sun, 'light'),
        label: renderActiveLabel('亮色', 'light'),
    },
    {
        key: 'dark',
        icon: renderIcon(Moon, 'dark'),
        label: renderActiveLabel('暗色', 'dark'),
    },
]);
</script>

<style scoped>
/* ---- Logo + 标题容器 ---- */
.header-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    text-decoration: none !important;
    border-radius: 10px;
    padding: 8px 14px;
    margin: -8px -14px;
    transition: transform 0.2s ease;
}

.header-brand--clickable {
    cursor: pointer;
}
.header-brand--clickable:hover {
    transform: scale(1.06);
}

/* ---- Logo 图片 ---- */
.header-logo {
    max-height: calc(64px * 0.55);
    width: auto;
    flex-shrink: 0;
}

/* ---- 标题文字 ---- */
.header-title {
    color: var(--n-text-color-2);
    white-space: nowrap;
}

/* ---- 头部按钮统一样式 ---- */
.header-action-btn {
    border-radius: 4px !important;
}
</style>
