import { defineStore } from 'pinia';
import { ref, computed, watchEffect } from 'vue';
import { lightTheme, darkTheme, useOsTheme } from 'naive-ui';
import type { GlobalTheme, GlobalThemeOverrides } from 'naive-ui';
import { adjustColor, isValidHexColor } from '@/shared/utils/color';
import { usePersistedRef } from '@/shared/composables/usePersistedRef';
import { getConfigs, getMyPreferences, updateConfig } from '@/api/configs';

type ThemeName = 'light' | 'dark' | 'auto';

/** Naive UI 默认主色 */
export const DEFAULT_PRIMARY_COLOR = '#18a058';

const THEME_MAP: Record<'light' | 'dark', GlobalTheme | null> = {
    light: lightTheme,
    dark: darkTheme,
};

const CYCLE: ThemeName[] = ['light', 'dark', 'auto'];

export const useSettingsStore = defineStore('settings', () => {
    // ---- 系统主题检测 ----
    const osTheme = useOsTheme(); // Ref<'dark' | 'light' | null>

    // ---- 状态 ----
    const themeName = usePersistedRef<ThemeName>('theme', 'auto');
    const primaryColor = usePersistedRef<string>('primaryColor', DEFAULT_PRIMARY_COLOR, {
        validate: isValidHexColor,
    });
    const isWatermarkVisible = usePersistedRef<boolean>('watermarkVisible', false);
    const watermarkContent = usePersistedRef<string>('watermarkContent', 'Naive Admin');
    const isColorBlindMode = usePersistedRef<boolean>('colorBlindMode', false);
    const sidebarAutoCollapseThreshold = usePersistedRef<number>('sidebarAutoCollapseThreshold', 1280);
    const isTabBarVisible = usePersistedRef<boolean>('tabbarVisible', true);
    const isFooterVisible = usePersistedRef<boolean>('footerVisible', true);
    const isBreadcrumbVisible = usePersistedRef<boolean>('breadcrumbVisible', true);
    const isRouteAnimationEnabled = usePersistedRef<boolean>('enableRouteAnimation', true, {
        onChange: () => {
            if (isAdminPreferencesLoaded.value) saveAdminPreferences();
        },
    });
    const animationType = usePersistedRef<
        | 'fade'
        | 'pop'
        | 'slide-left'
        | 'slide-right'
        | 'slide-top'
        | 'slide-bottom'
        | 'roll-left'
        | 'roll-right'
        | 'roll-top'
        | 'roll-bottom'
    >('animationType', 'slide-left', {
        onChange: () => {
            if (isAdminPreferencesLoaded.value) saveAdminPreferences();
        },
    });

    // ---- 解析后的实际主题对象 ----
    const resolvedTheme = computed<GlobalTheme | null>(() => {
        if (themeName.value === 'auto') {
            return osTheme.value === 'dark' ? darkTheme : lightTheme;
        }
        return THEME_MAP[themeName.value];
    });

    // ---- 同步 Tailwind dark: 变体 + 清理 index.html 遗留属性 + 同步 color-scheme ----
    watchEffect(() => {
        const isDark = resolvedTheme.value === darkTheme;
        const root = document.documentElement;

        // Tailwind dark: 变体
        root.classList.toggle('dark', isDark);

        // 同步 data-theme 属性（index.html 内联脚本设置的），保持与当前主题一致。
        // 不删除此属性，因为 #app-loading 的暗色样式依赖 html[data-theme="dark"] 选择器，
        // 在 Vue 挂载完成前如果删除会导致 loading 背景从暗色闪回白色。
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');

        // 同步 <meta name="color-scheme">，通知浏览器当前页面使用的色彩模式
        // 防止部分移动浏览器（如 Samsung Internet）强制覆盖页面背景色
        let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'color-scheme';
            document.head.appendChild(meta);
        }
        meta.content = isDark ? 'dark' : 'light';
    });

    /** 是否使用了自定义主色 */
    const isCustomColor = computed(() => primaryColor.value.toLowerCase() !== DEFAULT_PRIMARY_COLOR.toLowerCase());

    /**
     * 将主色覆盖注入到 NConfigProvider 的 themeOverrides。
     * 始终为合法色值生成 overrides，确保 Menu / Button / Tabbar 等所有组件
     * 使用统一的 primaryColor，确保 Menu / Button / TabBar 等所有组件
     * 使用一致的 primaryColor，避免 Naive UI 暗色主题自带的主色（如 #63e2b7）
     * 与 store 中的色值不一致。
     */
    const themeOverrides = computed<GlobalThemeOverrides | null>(() => {
        if (!isValidHexColor(primaryColor.value)) return null;
        const base = primaryColor.value;
        return {
            common: {
                primaryColor: base,
                primaryColorHover: adjustColor(base, 18),
                primaryColorPressed: adjustColor(base, -18),
                primaryColorSuppl: adjustColor(base, 18),
            },
        };
    });

    /** 重置主色为默认值 */
    function resetPrimaryColor() {
        primaryColor.value = DEFAULT_PRIMARY_COLOR;
    }

    // ---- 色弱模式 ----
    watchEffect(() => {
        document.documentElement.classList.toggle('color-blind', isColorBlindMode.value);
    });

    // ---- 直接设置 ----
    function setTheme(name: ThemeName) {
        themeName.value = name;
    }

    // ---- 切换主题 ----
    function toggleTheme() {
        const i = CYCLE.indexOf(themeName.value);
        themeName.value = CYCLE[(i + 1) % CYCLE.length];
    }

    // ---- 切换水印显示 ----
    function toggleWatermark() {
        isWatermarkVisible.value = !isWatermarkVisible.value;
    }

    // ---- 切换色弱模式 ----
    function toggleColorBlindMode() {
        isColorBlindMode.value = !isColorBlindMode.value;
    }

    // ---- 切换选项卡可见性 ----
    function toggleTabBar() {
        isTabBarVisible.value = !isTabBarVisible.value;
    }

    // ---- 切换页脚可见性 ----
    function toggleFooter() {
        isFooterVisible.value = !isFooterVisible.value;
    }

    // ---- 切换面包屑可见性 ----
    function toggleBreadcrumb() {
        isBreadcrumbVisible.value = !isBreadcrumbVisible.value;
    }

    // ---- 管理员偏好：从 configs 表加载 / 保存 ----
    const isAdminPreferencesLoaded = ref(false);

    /**
     * 加载管理员偏好（admin_preferences key）
     *
     * 接受外部传入的 configs（避免和 configStore.loadConfigs 重复调用同一 API），
     * 仅在 configs 未传入时才自行请求（向后兼容直接调用场景）。
     */
    async function loadAdminPreferences(configs?: Awaited<ReturnType<typeof getConfigs>>) {
        if (isAdminPreferencesLoaded.value) return;
        try {
            const list = configs ?? (await getConfigs());
            const pref = list.find((c) => c.key === 'admin_preferences');
            if (pref) {
                const v = pref.value;
                if (v.enableRouteAnimation !== undefined)
                    isRouteAnimationEnabled.value = v.enableRouteAnimation as boolean;
                if (v.animationType) animationType.value = v.animationType as typeof animationType.value;
            }
        } catch (err) {
            // 加载失败时使用 localStorage 中的值，不影响正常使用
            console.warn('[SettingsStore] 加载管理员偏好失败，使用本地缓存:', err);
        } finally {
            isAdminPreferencesLoaded.value = true;
        }
    }

    /**
     * 强制重新加载管理员偏好（登录后调用）
     *
     * 场景：
     * - main.ts 引导时用 publicConfigs 加载（白名单仅含 settings，**不含** admin_preferences）
     * - 登录后需要拿完整配置（含 admin_preferences）才能正确应用后端保存的偏好
     * - 使用 myPreferences 查询（仅需登录，不要求 config:admin:view 权限）
     * - 避免 privateConfigs 权限不足导致的 "无权访问" 错误
     */
    async function reloadAdminPreferences() {
        isAdminPreferencesLoaded.value = false;
        try {
            const pref = await getMyPreferences();
            if (pref) {
                const v = pref.value;
                if (v.enableRouteAnimation !== undefined)
                    isRouteAnimationEnabled.value = v.enableRouteAnimation as boolean;
                if (v.animationType) animationType.value = v.animationType as typeof animationType.value;
            }
        } catch (err) {
            // 加载失败时使用 localStorage 中的值，不影响正常使用
            console.warn('[SettingsStore] 加载管理员偏好失败，使用本地缓存:', err);
        } finally {
            isAdminPreferencesLoaded.value = true;
        }
    }

    /** 将管理员偏好保存到后端 configs 表 */
    async function saveAdminPreferences() {
        try {
            await updateConfig('admin_preferences', {
                enableRouteAnimation: isRouteAnimationEnabled.value,
                animationType: animationType.value,
            });
        } catch (err) {
            // 保存失败时 localStorage 已有值，下次加载时恢复
            console.warn('[SettingsStore] 保存管理员偏好失败:', err);
        }
    }

    return {
        themeName,
        resolvedTheme,
        setTheme,
        toggleTheme,
        primaryColor,
        isCustomColor,
        themeOverrides,
        resetPrimaryColor,
        isWatermarkVisible,
        watermarkContent,
        toggleWatermark,
        isColorBlindMode,
        toggleColorBlindMode,
        sidebarAutoCollapseThreshold,
        isTabBarVisible,
        toggleTabBar,
        isFooterVisible,
        toggleFooter,
        isBreadcrumbVisible,
        toggleBreadcrumb,
        isRouteAnimationEnabled,
        animationType,
        loadAdminPreferences,
        reloadAdminPreferences,
        saveAdminPreferences,
    };
});
