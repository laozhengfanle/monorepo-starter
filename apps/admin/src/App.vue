<template>
    <!-- 全局配置：主题、中文语言包、禁用内联主题以优化性能 -->
    <n-config-provider
        :theme="resolvedTheme"
        :theme-overrides="themeOverrides"
        :locale="zhCN"
        :date-locale="dateZhCN"
        inline-theme-disabled
    >
        <n-message-provider>
            <n-dialog-provider>
                <n-notification-provider>
                    <n-loading-bar-provider>
                        <AppRouterView />
                    </n-loading-bar-provider>
                </n-notification-provider>
            </n-dialog-provider>
        </n-message-provider>

        <!-- 全屏水印：独立渲染，不包裹内容，通过 v-if 控制开关 -->
        <n-watermark
            v-if="isWatermarkVisible"
            :content="watermarkText"
            cross
            fullscreen
            selectable
            :font-size="24"
            :font-weight="100"
            font-color="rgba(128, 128, 128, .1)"
            :line-height="16"
            :width="192"
            :height="128"
            :x-offset="12"
            :y-offset="28"
            :global-rotate="-15"
            :y-gap="100"
            :x-gap="100"
        />
    </n-config-provider>
</template>

<script setup lang="ts">
defineOptions({ name: 'App' });
import { computed } from 'vue';
import { useSettingsStore } from '@/shared/stores/settings';
import { useConfigStore } from '@/shared/stores/config';
import { storeToRefs } from 'pinia';
import AppRouterView from '@/app/components/AppRouterView.vue';
// Naive UI 中文语言包
import { zhCN, dateZhCN } from 'naive-ui';

const settingsStore = useSettingsStore();
const { resolvedTheme, themeOverrides, isWatermarkVisible } = storeToRefs(settingsStore);
const configStore = useConfigStore();

/**
 * 水印文本：优先使用后端配置的水印内容，
 * 如果后端配置为空则回退到 settings store 的本地配置。
 */
const watermarkText = computed(() => {
    const remote = configStore.watermarkConfig.content?.trim();
    if (remote) return remote;
    return isWatermarkVisible.value ? settingsStore.watermarkContent || '' : '';
});
</script>
