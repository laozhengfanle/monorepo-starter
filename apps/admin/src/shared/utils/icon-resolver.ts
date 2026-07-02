/**
 * 图标解析器 — "库名:图标原始导出名" → Vue 组件
 *
 * 菜单 icon 字段格式：`库名:导出名`，如 "tabler:ShieldLock"、"fluent:Server24Regular"。
 * 后期菜单由后端动态下发时，只需一个 icon 字符串即可同时携带库和图标两个信息。
 *
 * 新增图标只需 import 并放入对应库的 map 中。
 *
 * 为什么不用 @ant-design/icons-vue：
 *   - antd 系列的 Icon 组件渲染为 <span class="anticon"> 包裹 svg
 *   - Naive UI 的 <n-icon> 期望子组件直接渲染 <svg>，否则 slot 渲染失败导致菜单无图标
 *   - @vicons/antd 同样提供 SafetyOutlined 等 antd 风格图标，但接口与 @vicons/tabler 一致（直接 <svg>）
 *
 * XSS 防护：
 *   - **绝对不允许**用 v-html="menu.icon" 渲染菜单 icon
 *   - 即使后端下发恶意字符串（如 "<script>alert(1)</script>"），
 *     resolveIcon() 也只会按字符串查表 → 找不到 → 返回 null（让调用方决定兜底），
 *     永远不会触发 innerHTML 注入
 *   - 单元测试覆盖：恶意字符串 → 不会执行 JS
 *
 * 图标名验证方法（ESM 项目）：
 *   node -e "import('@vicons/antd').then(m => console.log('xxx' in m))"
 */
import type { Component } from 'vue';
import { defineComponent, h } from 'vue';
import {
    Home,
    ShieldLock,
    Link,
    QuestionMark,
    Dashboard,
    ChartBar,
    User,
    Shield,
    Menu2,
    Settings,
    File,
    Phone,
    Mail,
    Cloud,
    Database,
    BrandApple,
    Trash,
    LayoutGrid,
    Pencil,
} from '@vicons/tabler';
import { Server24Regular } from '@vicons/fluent';
import { SafetyOutlined } from '@vicons/antd';

/** 各图标库的图标映射（库名 → 导出名 → Vue 组件） */
const ICON_LIBRARIES: Record<string, Record<string, Component>> = {
    tabler: {
        Home,
        ShieldLock,
        Link,
        QuestionMark,
        Dashboard,
        ChartBar,
        User,
        Shield,
        Menu2,
        Settings,
        File,
        Phone,
        Mail,
        Cloud,
        Database,
        BrandApple,
        Trash,
        LayoutGrid,
        Pencil,
    },
    fluent: { Server24Regular },
    antd: { SafetyOutlined },
};

/**
 * 兜底图标组件 — 当 menu.icon 是未知字符串、含恶意内容时使用。
 * 用 Vue 组件包裹 @vicons/tabler 的 QuestionMark（问号图标）。
 *
 * 使用场景：直接 `<n-icon :component="resolveIconOrFallback(menu.icon)" />`，
 * 永远不需要写 v-if 判断。恶意输入（HTML / script）会落到这个组件。
 */
export const FallbackIcon = defineComponent({
    name: 'FallbackIcon',
    render() {
        return h(QuestionMark);
    },
});

/**
 * 解析 menu.icon 字符串为 Vue 组件。
 *
 * 输入格式："{libName}:{iconName}"，例如 "tabler:ShieldLock"
 *
 * @param name 菜单 icon 字符串，可能为 undefined / 非法格式 / 未知图标
 * @returns Vue 组件，或 null（找不到对应图标时）
 */
export function resolveIcon(name: string | undefined): Component | null {
    if (!name || typeof name !== 'string') {
        return null;
    }
    const idx = name.indexOf(':');
    if (idx === -1) {
        // 没有 "库名:" 前缀 → 视为未知
        return null;
    }
    const lib = name.slice(0, idx);
    const icon = name.slice(idx + 1);
    return ICON_LIBRARIES[lib]?.[icon] ?? null;
}

/**
 * 解析 menu.icon 字符串为 Vue 组件，找不到时返回 FallbackIcon（兜底问号）。
 *
 * 与 resolveIcon 的区别：本函数永远返回非 null，适合无脑 `<n-icon :component="..." />` 场景。
 * 任何未识别输入（含恶意字符串）都会落到 FallbackIcon，不抛错也不渲染空白。
 *
 * @param name 菜单 icon 字符串
 * @returns Vue 组件（永远非 null）
 */
export function resolveIconOrFallback(name: string | undefined): Component {
    return resolveIcon(name) ?? FallbackIcon;
}
