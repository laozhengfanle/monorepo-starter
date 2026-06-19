<template>
    <div
        class="tab-bar flex items-center border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#18181c] px-(--gap)"
    >
        <!-- 标签列表：超出横向滚动 -->
        <div class="tab-scroll-wrap relative flex-1 min-w-0">
            <div
                ref="scrollRef"
                class="tab-scroll relative flex items-center overflow-x-auto gap-1.5 py-1.5"
                :style="themeVars"
            >
                <!-- 滑动指示器 -->
                <div
                    class="tab-indicator absolute top-1/2 -translate-y-1/2 h-8 rounded-md pointer-events-none bg-[var(--tab-indicator-bg)] dark:bg-[var(--tab-indicator-bg-dark)] transition-all duration-300 ease-out"
                    :style="indicatorStyle"
                ></div>

                <button
                    v-for="(tag, index) in tagList"
                    :key="tag.fullPath"
                    :ref="(el) => setBtnRef(el as HTMLElement | null, index)"
                    :class="[
                        'group relative flex items-center gap-1.5 px-3 h-8 text-[13px] rounded-md',
                        'cursor-pointer select-none shrink-0 whitespace-nowrap',
                        'transition-colors duration-300',
                        isActive(tag)
                            ? 'text-[var(--tab-active-color)] dark:text-[var(--tab-active-color-dark)]'
                            : [
                                  'text-gray-500 dark:text-gray-400',
                                  'hover:text-gray-700 dark:hover:text-gray-200',
                                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                              ],
                    ]"
                    @click="onTagClick(tag)"
                >
                    <span>{{ tag.title }}</span>

                    <!-- 关闭按钮（首页标签不可关闭） -->
                    <span
                        v-if="index > 0"
                        :class="[
                            'flex items-center justify-center w-4 h-4 rounded text-[14px] leading-none shrink-0',
                            'transition-opacity duration-150',
                            isActive(tag)
                                ? 'opacity-50 hover:opacity-100'
                                : 'opacity-0 group-hover:opacity-50 hover:!opacity-100',
                        ]"
                        @click.stop="onClose(tag, index)"
                    >
                        ×
                    </span>
                </button>
            </div>

            <!-- 右侧渐变遮罩 -->
            <div
                class="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white dark:from-[#18181c] to-transparent"
            ></div>
        </div>

        <!-- 右侧下拉菜单 -->
        <div class="flex items-center shrink-0 pl-2">
            <n-dropdown trigger="hover" :options="tabSuffixOptions" show-arrow @select="onTabSuffixSelect">
                <n-button quaternary size="small">
                    <template #icon>
                        <n-icon :component="DotsVertical" />
                    </template>
                </n-button>
            </n-dropdown>
        </div>
    </div>
</template>

<script lang="ts" setup>
defineOptions({ name: 'TabBar' });
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { DotsVertical } from '@vicons/tabler';
import type { DropdownOption } from 'naive-ui';
import { useTabBarStore } from '@/shared/stores/tabBar';
import { listenerRouteChange } from '@/app/router/route-listener';
import { DEFAULT_ROUTE_NAME, REDIRECT_ROUTE_NAME } from '@/app/router/constants';
import { useSettingsStore } from '@/shared/stores/settings';
import type { TagProps } from '@/shared/stores/tabBar';
import { hexToRgb } from '@/shared/utils/color';

const router = useRouter();
const route = useRoute();
const tabBarStore = useTabBarStore();
const settingsStore = useSettingsStore();

// ---- 从 store 获取标签列表 ----
const tagList = computed(() => tabBarStore.tagList);

// ---- 监听路由变化，自动新增标签 ----
// updateTabList 内部自行处理重复、activeMenu 替换、BAN_LIST 过滤等逻辑
listenerRouteChange((to) => {
    tabBarStore.updateTabList(to);
});

// ---- 是否当前激活 ----
// 不仅匹配自身 route.name，也匹配 activeMenu — 解决详情页 tab 选中态丢失问题
function isActive(tag: TagProps): boolean {
    return tag.name === (route.name as string) || tag.name === (route.meta?.activeMenu as string);
}

// ========== 主题色 ==========
// 跟随 settingsStore.primaryColor 变化的 CSS 变量
// 与 Naive UI Menu 保持一致：文本色 = primaryColor，指示器 = primaryColor + alpha
const themeVars = computed(() => {
    const hex = settingsStore.primaryColor;
    const rgb = hexToRgb(hex);
    if (!rgb) return {};
    return {
        '--tab-active-color': hex,
        '--tab-active-color-dark': hex,
        '--tab-indicator-bg': `rgba(${rgb.r},${rgb.g},${rgb.b},0.10)`,
        '--tab-indicator-bg-dark': `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`,
    };
});
// ========== 主题色 end ==========

// ========== 滑动指示器 ==========
const scrollRef = ref<HTMLElement | null>(null);
const btnRefs = ref<Map<number, HTMLElement>>(new Map());

function setBtnRef(el: HTMLElement | null, index: number) {
    if (el) {
        btnRefs.value.set(index, el);
    } else {
        btnRefs.value.delete(index);
    }
}

const indicatorStyle = reactive({
    left: '0px',
    width: '0px',
    opacity: 0 as number,
});

// 当前激活标签在 tagList 中的索引
const activeIndex = computed(() => tagList.value.findIndex((tag) => isActive(tag)));

function updateIndicator() {
    try {
        const idx = activeIndex.value;
        const container = scrollRef.value;
        const btn = idx >= 0 ? btnRefs.value.get(idx) : undefined;

        if (!container || !btn) {
            indicatorStyle.opacity = 0;
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();

        indicatorStyle.left = `${btnRect.left - containerRect.left + container.scrollLeft}px`;
        indicatorStyle.width = `${btnRect.width}px`;
        indicatorStyle.opacity = 1;
    } catch {
        // 路由快速切换时 DOM 可能尚未就绪，静默忽略
        indicatorStyle.opacity = 0;
    }
}

// 路由变化 / tagList 变化时更新指示器位置
watch([activeIndex, tagList], () => nextTick(updateIndicator), { flush: 'post', immediate: true });
// ========== 滑动指示器 end ==========

// ---- 点击标签 → 跳转 ----
function onTagClick(tag: TagProps) {
    router.push(tag.fullPath);
}

// ---- 关闭标签 ----
function onClose(tag: TagProps, index: number) {
    tabBarStore.deleteTag(index, tag);
    // 如果关闭的是当前标签（含 activeMenu 指向的场景）→ 跳到前一个
    if (isActive(tag)) {
        const prev = tagList.value[index - 1];
        if (prev) {
            router.push(prev.fullPath);
        } else {
            router.push({ name: DEFAULT_ROUTE_NAME });
        }
    }
}

// ---- 右键菜单 ----

// ---- 下拉菜单选项 ----
const tabSuffixOptions: DropdownOption[] = [
    { label: '关闭当前', key: 'current' },
    { label: '关闭其它', key: 'other' },
    { label: '全部关闭', key: 'all' },
    { label: '重新加载', key: 'reload' },
];

function onTabSuffixSelect(key: string) {
    const currentIdx = tagList.value.findIndex((tag) => isActive(tag));

    switch (key) {
        case 'current': {
            const curTag = tagList.value[currentIdx];
            if (curTag && currentIdx > 0) {
                onClose(curTag, currentIdx);
            }
            break;
        }
        case 'other': {
            // 保留首页 + 当前
            const filtered = tagList.value.filter((_tag, idx) => idx === 0 || idx === currentIdx);
            tabBarStore.freshTabList(filtered);
            break;
        }
        case 'all':
            tabBarStore.resetTabList();
            router.push({ name: DEFAULT_ROUTE_NAME });
            break;
        case 'reload':
            // 利用 redirect 路由实现无感重载
            tabBarStore.deleteCache(tagList.value[currentIdx]?.name || '');
            router.push({
                name: REDIRECT_ROUTE_NAME,
                params: { path: route.fullPath },
            });
            tabBarStore.addCache(tagList.value[currentIdx]?.name || '');
            break;
    }
}
</script>

<style scoped>
.tab-scroll {
    scrollbar-width: none;
}
.tab-scroll::-webkit-scrollbar {
    display: none;
}
</style>
