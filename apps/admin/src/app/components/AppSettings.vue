<template>
    <!--
        Settings.vue — 设置抽屉面板

        从屏幕右侧滑出，提供个人偏好设置项：
          界面显示：主题模式 / 水印 / 色弱模式
          路由动画：启用路由动画 / 动画类型
          布局选项：选项卡 / 页脚
    -->
    <n-drawer v-model:show="visible" :width="400" placement="right">
        <n-drawer-content title="应用设置" body-content-style="padding: var(--gap)">
            <div :style="{ '--primary-color': primaryColor }">
                <!-- ===== 界面显示 ===== -->
                <div>
                    <h3 class="section-title">
                        <span class="section-title__bar" />
                        界面显示
                    </h3>

                    <!-- 主题模式：与 option-row 同 padding 保证视觉节奏一致 -->
                    <div class="subsection">
                        <p class="subsection-label">主题模式</p>
                        <p class="section-desc">选择界面色彩方案，自动模式将跟随系统偏好</p>
                        <div class="grid grid-cols-3 gap-2 mb-3">
                            <button
                                v-for="opt in themeCards"
                                :key="opt.key"
                                class="theme-card"
                                :class="{ 'theme-card--active': themeName === opt.key }"
                                :aria-pressed="themeName === opt.key ? 'true' : 'false'"
                                :aria-label="`${opt.label}主题`"
                                role="radio"
                                @click="onThemeChange(opt.key)"
                            >
                                <n-icon :size="22" class="mb-1.5">
                                    <component :is="opt.icon" />
                                </n-icon>
                                <span class="text-xs font-medium">{{ opt.label }}</span>
                            </button>
                        </div>
                    </div>

                    <n-divider class="!my-3" />

                    <!-- 主题色 -->
                    <div class="subsection">
                        <p class="subsection-label">主题色</p>
                        <p class="section-desc">自定义应用的主色调，将应用于按钮、链接等所有强调元素</p>

                        <!-- 预设色块 -->
                        <div class="preset-colors">
                            <button
                                v-for="c in presetColors"
                                :key="c"
                                class="preset-color-btn"
                                :style="{ backgroundColor: c }"
                                :title="c"
                                :aria-label="`选择主题色 ${c}`"
                                @click="onPrimaryColorChange(c)"
                            >
                                <n-icon v-if="primaryColor.toLowerCase() === c.toLowerCase()" :size="16" color="#fff">
                                    <Check />
                                </n-icon>
                            </button>
                        </div>

                        <!-- 调色面板 + 手动输入 -->
                        <div class="color-picker-row flex">
                            <n-color-picker v-model:value="primaryColor" :modes="['hex']">
                                <template #action>
                                    <span class="text-xs text-(--n-text-color-3)">选择颜色</span>
                                </template>
                            </n-color-picker>
                            <!-- 手动输入的 HEX 颜色文本框：clearable 让用户能一键清空重新输入 -->
                            <n-input
                                v-model:value="colorInput"
                                placeholder="#18A058"
                                size="small"
                                class="color-hex-input"
                                clearable
                                @update:value="commitColor"
                            />
                        </div>

                        <div class="mt-2 flex items-center gap-2">
                            <span class="text-xs text-(--n-text-color-3)">当前</span>
                            <span
                                class="inline-block w-3.5 h-3.5 rounded-full border border-(--n-border-color)"
                                :style="{ backgroundColor: primaryColor }"
                            />
                            <span class="text-xs font-mono text-(--n-text-color-2)">{{ primaryColor }}</span>
                            <n-button
                                v-if="primaryColor.toLowerCase() !== DEFAULT_PRIMARY_COLOR.toLowerCase()"
                                size="tiny"
                                text
                                @click="settings.resetPrimaryColor()"
                            >
                                恢复默认
                            </n-button>
                        </div>
                    </div>

                    <n-divider class="!my-3" />

                    <!-- 水印 & 色弱模式 -->
                    <div class="option-list">
                        <label class="option-row">
                            <div class="option-row__text">
                                <span class="option-row__label">界面水印</span>
                                <span class="option-row__desc">页面背景显示水印文字，防止截图泄露</span>
                            </div>
                            <n-switch v-model:value="isWatermarkVisible" size="medium" />
                        </label>

                        <label class="option-row">
                            <div class="option-row__text">
                                <span class="option-row__label">色弱模式</span>
                                <span class="option-row__desc">增强色觉辅助，帮助色觉障碍用户区分界面元素</span>
                            </div>
                            <n-switch v-model:value="isColorBlindMode" size="medium" />
                        </label>
                    </div>
                </div>

                <n-divider class="!my-5" />

                <!-- ===== 路由动画 ===== -->
                <div>
                    <h3 class="section-title">
                        <span class="section-title__bar" />
                        路由动画
                    </h3>

                    <div class="option-list">
                        <label class="option-row">
                            <div class="option-row__text">
                                <span class="option-row__label">启用路由动画</span>
                                <span class="option-row__desc">页面切换时的过渡动画效果</span>
                            </div>
                            <n-switch v-model:value="isRouteAnimationEnabled" size="medium" />
                        </label>

                        <div class="option-row">
                            <div class="option-row__text">
                                <span class="option-row__label">动画类型</span>
                                <span class="option-row__desc">选择页面切换的动画风格</span>
                            </div>
                            <n-select
                                v-model:value="animationType"
                                :options="animationOptions"
                                size="small"
                                style="width: 160px"
                                :disabled="!isRouteAnimationEnabled"
                            />
                        </div>
                    </div>
                </div>

                <n-divider class="!my-5" />

                <!-- ===== 布局选项 ===== -->
                <div>
                    <h3 class="section-title">
                        <span class="section-title__bar" />
                        布局选项
                    </h3>

                    <div class="option-list">
                        <label class="option-row">
                            <div class="option-row__text">
                                <span class="option-row__label">显示选项卡</span>
                                <span class="option-row__desc">顶部标签栏，用于快速切换已打开的页面</span>
                            </div>
                            <n-switch v-model:value="isTabBarVisible" size="medium" />
                        </label>

                        <label class="option-row">
                            <div class="option-row__text">
                                <span class="option-row__label">显示页脚</span>
                                <span class="option-row__desc">页面底部的版权信息和链接</span>
                            </div>
                            <n-switch v-model:value="isFooterVisible" size="medium" />
                        </label>

                        <label class="option-row">
                            <div class="option-row__text">
                                <span class="option-row__label">显示面包屑</span>
                                <span class="option-row__desc">内容区顶部的面包屑导航路径</span>
                            </div>
                            <n-switch v-model:value="isBreadcrumbVisible" size="medium" />
                        </label>

                        <div class="option-row">
                            <div class="option-row__text">
                                <span class="option-row__label">侧边栏自动收折</span>
                                <span class="option-row__desc">窗口宽度小于阈值时自动收起侧边栏</span>
                            </div>
                            <n-select
                                v-model:value="sidebarAutoCollapseThreshold"
                                :options="collapseOptions"
                                size="small"
                                style="width: 160px"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </n-drawer-content>
    </n-drawer>
</template>

<script setup lang="ts">
defineOptions({ name: 'AppSettings' });
/**
 * Settings.vue — 设置抽屉面板
 *
 * 提供主题模式切换与水印、色弱模式、布局选项开关。
 * 通过 v-model:show 控制抽屉的显示/隐藏。
 */
import { ref, watch } from 'vue';
import { Sun, Moon, DeviceDesktop, Check } from '@vicons/tabler';
import { useSettingsStore, DEFAULT_PRIMARY_COLOR } from '@/shared/stores/settings';
import { storeToRefs } from 'pinia';
import type { Component } from 'vue';

// ---- 双向绑定：抽屉可见性 ----
const visible = defineModel<boolean>('show', { required: true });

// ---- 设置状态 ----
const settings = useSettingsStore();
const {
    themeName,
    isWatermarkVisible,
    isColorBlindMode,
    isTabBarVisible,
    isFooterVisible,
    isBreadcrumbVisible,
    primaryColor,
    sidebarAutoCollapseThreshold,
    isRouteAnimationEnabled,
    animationType,
} = storeToRefs(settings);

// ---- 主题色输入缓冲（避免每敲一个字符就触发颜色解析报错） ----
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorInput = ref(primaryColor.value);

/** 仅当输入为合法 hex 色值时，才提交到 store */
function commitColor(value: string) {
    if (HEX_COLOR_RE.test(value)) {
        primaryColor.value = value.toLowerCase();
    }
    colorInput.value = value;
}

// 来自 store 的变化（预设按钮 / 颜色选择器 / 重置）同步回输入框
watch(primaryColor, (v) => {
    colorInput.value = v;
});

// ---- 主题卡片选项 ----
interface ThemeCard {
    key: string;
    label: string;
    icon: Component;
}

const themeCards: ThemeCard[] = [
    { key: 'auto', label: '自动', icon: DeviceDesktop },
    { key: 'light', label: '亮色', icon: Sun },
    { key: 'dark', label: '暗色', icon: Moon },
];

/** 主题切换回调 */
function onThemeChange(value: string) {
    settings.setTheme(value as 'light' | 'dark' | 'auto');
}

// ---- 主题色预设 ----
const presetColors: string[] = [
    '#18A058',
    '#1677FF',
    '#409EFF',
    '#722ED1',
    '#F5222D',
    '#FA8C16',
    '#13C2C2',
    '#52C41A',
    '#EB2F96',
    '#FAAD14',
];

/** 侧边栏自动收折阈值选项 */
const collapseOptions = [
    { label: '不收起', value: 0 },
    { label: '≤ 1024px', value: 1024 },
    { label: '≤ 1280px（默认）', value: 1280 },
    { label: '≤ 1440px', value: 1440 },
    { label: '≤ 1920px', value: 1920 },
];

/** 路由动画类型选项 */
const animationOptions = [
    { label: '淡入淡出', value: 'fade' },
    { label: '弹出', value: 'pop' },
    { label: '从左侧进入', value: 'slide-left' },
    { label: '从右侧进入', value: 'slide-right' },
    { label: '从上方进入', value: 'slide-top' },
    { label: '从下方进入', value: 'slide-bottom' },
    { label: '左侧翻滚进入', value: 'roll-left' },
    { label: '右侧翻滚进入', value: 'roll-right' },
    { label: '上方翻滚进入', value: 'roll-top' },
    { label: '下方翻滚进入', value: 'roll-bottom' },
];

/** 预设按钮点击：直接设置主色 */
function onPrimaryColorChange(value: string) {
    primaryColor.value = value;
    colorInput.value = value;
}
</script>

<style scoped>
/* ===== 一级标题：带左侧色条 ===== */
.section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--n-text-color);
}
.section-title__bar {
    display: inline-block;
    width: 3px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
    background: var(--primary-color, #18a058);
}

/* ===== 一级标题下方描述 ===== */
.section-desc {
    margin: 0 0 16px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--n-text-color-3);
}

/* ===== 二级标签 + 主题卡片区域 ===== */
.subsection {
    padding: 10px 0;
}
.subsection-label {
    margin: 0 0 2px;
    font-size: 13px;
    font-weight: 600;
    color: var(--n-text-color-2);
}

/* ===== 选项列表（三级） ===== */
.option-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/* ===== 单行选项：整行可点击（label 包裹 switch） ===== */
.option-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    margin: 0 -12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.15s;
}
.option-row:hover {
    background-color: var(--n-action-color, rgba(0, 0, 0, 0.04));
}

/* ===== 选项文字区域 ===== */
.option-row__text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    margin-right: 16px;
    min-width: 0;
}

/* ===== 选项名：清晰可辨 ===== */
.option-row__label {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--n-text-color);
}

/* ===== 选项描述：弱化但不消失 ===== */
.option-row__desc {
    font-size: 11px;
    line-height: 1.5;
    color: var(--n-text-color-3);
}

/* ===== 主题卡片按钮 ===== */
.theme-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 8px 14px;
    border-radius: 8px;
    border: 1.5px solid var(--n-border-color, rgb(224, 224, 230));
    background: transparent;
    cursor: pointer;
    transition:
        border-color 0.2s,
        background-color 0.2s,
        color 0.2s,
        box-shadow 0.2s;
    color: var(--n-text-color-3);
}
.theme-card:hover {
    border-color: var(--n-text-color-3);
    color: var(--n-text-color-2);
}
.theme-card--active {
    border-color: var(--primary-color, #18a058);
    background-color: color-mix(in srgb, var(--primary-color, #18a058) 8%, transparent);
    color: var(--primary-color, #18a058);
    font-weight: 600;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color, #18a058) 25%, transparent);
}

/* ===== 主题色预设色块 ===== */
.preset-colors {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
}

.preset-color-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
        border-color 0.15s,
        transform 0.15s,
        box-shadow 0.15s;
    padding: 0;
    outline: none;
}
.preset-color-btn:hover {
    transform: scale(1.15);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
}
.preset-color-btn:focus-visible {
    border-color: var(--n-text-color);
}

/* ===== 调色面板 + HEX 输入行 ===== */
.color-picker-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.color-hex-input {
    width: 140px;
    flex-shrink: 0;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}
</style>
