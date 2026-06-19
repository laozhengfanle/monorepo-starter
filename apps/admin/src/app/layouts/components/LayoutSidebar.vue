<template>
    <n-layout-sider
        bordered
        show-trigger
        collapse-mode="width"
        :collapsed-width="collapseWidth"
        :collapsed="isCollapsed"
        content-class="flex flex-col py-4"
        @update:collapsed="isCollapsed = $event"
    >
        <n-menu
            class="flex-1!"
            accordion
            :value="selectedKey"
            :expanded-keys="openKeys"
            :options="menuTree"
            :collapsed-width="collapseWidth"
            aria-label="主导航菜单"
            @update:value="onMenuSelect"
            @update:expanded-keys="openKeys = $event"
        >
        </n-menu>

        <n-menu
            value=""
            mode="vertical"
            :options="subMenuOptions"
            :collapsed-width="collapseWidth"
            :indent="22"
            aria-label="辅助导航"
            @update:value="onSubMenuSelect"
        >
        </n-menu>

        <n-divider class="my-0!" />

        <n-menu
            id="user-menu"
            :class="isCollapsed ? 'collapsed' : ''"
            mode="horizontal"
            :options="userMenuOptions"
            :value="undefined"
            :expanded-keys="userMenuExpandedKeys"
            :collapsed="isCollapsed"
            :collapsed-width="collapseWidth"
            :collapsed-icon-size="isCollapsed ? 28 : 36"
            :render-icon="renderUserMenuIcon"
            :render-label="renderUserMenuLabel"
            dropdown-placement="right-end"
            aria-label="用户菜单"
            @update:value="onUserMenuSelect"
            @update:expanded-keys="userMenuExpandedKeys = $event"
        >
        </n-menu>
    </n-layout-sider>
</template>

<script setup lang="ts">
defineOptions({ name: 'LayoutSidebar' });
import { ref, h, watch, computed } from 'vue';
import type { MenuOption } from 'naive-ui';
import type { Component } from 'vue';
import { NIcon, NAvatar, NText } from 'naive-ui';
import { User, Settings, Logout, DotsVertical } from '@vicons/tabler';
import { BugTwotone } from '@vicons/antd';
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/shared/stores/admin';
import useMenuTree from '@/app/composables/useMenuTree';
import { useMediaQuery } from '@vueuse/core';
import { useSettingsStore } from '@/shared/stores/settings';
import { storeToRefs } from 'pinia';

const collapseWidth = 64;

// 从设置中读取自动收折阈值，动态匹配窗口宽度
const { sidebarAutoCollapseThreshold, primaryColor } = storeToRefs(useSettingsStore());
const isSmallScreen = useMediaQuery(computed(() => `(max-width: ${sidebarAutoCollapseThreshold.value}px)`));
const isCollapsed = ref(isSmallScreen.value);
watch(isSmallScreen, (v) => {
    isCollapsed.value = v;
});

const { menuTree, openKeys, selectedKey, onMenuClick } = useMenuTree();

function onMenuSelect(key: string, item: MenuOption) {
    onMenuClick(key, item as Parameters<typeof onMenuClick>[1]);
}

const router = useRouter();
const adminStore = useAdminStore();

async function onLogout() {
    await adminStore.logout();
    router.push({ name: 'LoginPage' });
}

function renderIcon(icon: Component) {
    return () => h(NIcon, null, { default: () => h(icon) });
}

const subMenuOptions: MenuOption[] = [
    {
        label: '开发文档',
        key: 'docs',
        icon: renderIcon(BugTwotone),
    },
];

const userMenuOptions: MenuOption[] = [
    {
        label: '欢迎使用',
        key: 'my',
        children: [
            {
                label: '个人中心',
                key: 'profile',
                icon: renderIcon(User),
            },
            {
                label: '账号设置',
                key: 'settings',
                icon: renderIcon(Settings),
            },
            { key: 'd1', type: 'divider' },
            {
                label: '退出登录',
                key: 'logout',
                icon: renderIcon(Logout),
            },
        ],
    },
];

function renderUserMenuIcon(option: MenuOption) {
    if (option.key === 'my') {
        return h(NAvatar, {
            src: adminStore.adminAvatar,
            size: isCollapsed.value ? 28 : 36,
            round: false,
            style: { transition: 'all 0.3s' },
        });
    }
    // 为子菜单项(个人中心、账号设置、退出登录)渲染图标
    if (option.icon) {
        return option.icon();
    }
    return undefined;
}

function renderUserMenuLabel(option: MenuOption) {
    if (option.key === 'my') {
        const name = adminStore.adminName || '未登录';
        const email = (adminStore.adminInfo?.email as string) || '';
        return h('div', { class: 'flex items-center justify-between w-full' }, [
            h('div', { class: 'flex flex-col leading-tight' }, [
                h(NText, { class: 'text-base font-bold' }, () => name),
                h(NText, { depth: 3, class: 'text-[12px]' }, () => email),
            ]),
            h(
                NIcon,
                {
                    size: 18,
                    color: userMenuExpandedKeys.value.includes('my') ? primaryColor.value : undefined,
                    class: {
                        'dots-vertical-icon': true,
                        'dots-vertical-icon--rotated': userMenuExpandedKeys.value.includes('my'),
                    },
                    style: {
                        transition: 'transform 0.3s',
                        flexShrink: '0',
                    },
                },
                () => h(DotsVertical),
            ),
        ]);
    }
    return option.label as string;
}

function onSubMenuSelect(key: string) {
    if (key === 'docs') {
        window.open(router.resolve({ name: 'DocPage' }).href, '_blank', 'noopener,noreferrer');
    }
}

function onUserMenuSelect(key: string) {
    if (key === 'logout') {
        onLogout();
    } else if (key === 'profile') {
        // 跳转到个人中心页面
        router.push({ name: 'AccountProfilePage' });
    } else if (key === 'settings') {
        // 跳转到账号设置页面
        router.push({ name: 'AccountSettingsPage' });
    }
}

const userMenuExpandedKeys = ref<string[]>([]);
</script>

<style scoped>
:deep(.n-menu-item) {
    width: 100% !important;
}

:deep(#user-menu) {
    margin-top: 6px;
}
:deep(#user-menu) .n-submenu {
    width: 100%;
    padding: 0 8px;
    transition: padding 0.3s var(--n-bezier);
}
:deep(#user-menu) .n-submenu,
:deep(#user-menu) .n-menu-item,
:deep(#user-menu) .n-menu-item-content {
    height: auto;
}
:deep(#user-menu) .n-menu-item-content {
    padding: 8px;
    transition: padding 0.3s var(--n-bezier);
}
:deep(#user-menu) .n-menu-item-content--hover {
    background-color: var(--n-item-color-hover) !important;
    border-radius: var(--n-border-radius);
    transition: background-color 0.3s var(--n-bezier);
}
:deep(#user-menu) .n-menu-item-content:hover .dots-vertical-icon,
:deep(#user-menu) .n-menu-item-content--hover .dots-vertical-icon,
:deep(#user-menu) .dots-vertical-icon--rotated {
    transform: rotate(90deg);
}
:deep(#user-menu).collapsed .n-menu-item-content {
    padding: 0 8px;
}
</style>
