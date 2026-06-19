/**
 * useDesignTokens — 从 CSS 自定义属性读取设计令牌
 *
 * 解决 CSS 变量（如 --gap）与 JS 模板中硬编码值不同步的问题。
 * CSS 作为唯一真相来源，JS 在运行时读取。
 */
import { ref, onMounted } from 'vue';

/** 从 :root 读取 CSS 自定义属性，解析为数字（去掉 px 等单位） */
function readCSSNumber(prop: string): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
    if (!raw) return 0;
    const num = Number.parseFloat(raw);
    return Number.isNaN(num) ? 0 : num;
}

export function useDesignTokens() {
    const gap = ref(16); // 默认值，SSR / 挂载前兜底

    onMounted(() => {
        gap.value = readCSSNumber('--gap');
    });

    return { gap };
}
