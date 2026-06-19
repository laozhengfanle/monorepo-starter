/**
 * 全局配置 Store
 *
 * 职责：
 * - 应用启动时从后端加载 config 表数据
 * - 将配置按 key 分组暴露为响应式状态
 * - 供 Header、Footer、路由等组件消费
 *
 * 配置映射（全部来自 key="settings" 这一条记录）：
 *   name / logo / footerText → systemBasic
 *   keepAliveMax / requestTimeout → uiConfig
 *   watermarkContent → watermarkConfig
 *   passwordMinLength / passwordComplexity / loginFailThreshold / lockDuration → securityConfig
 *
 * Turnstile 人机验证（来自 key="turnstile.config" 这条记录，**已脱敏 secretKey**）：
 *   enabled / siteKey → turnstileConfig（登录页用来决定是否渲染 widget）
 */
import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { getConfigs } from '@/api/configs';
import { setRequestTimeout } from '@/shared/request/request-config';

/** 系统基本信息 */
interface SystemBasic {
    name: string;
    logo: string;
    footerText: string;
}

/** 界面配置 */
interface UiConfig {
    keepAliveMax: number;
    requestTimeout: number;
}

/** 水印配置 */
interface WatermarkConfig {
    content: string;
}

/** 安全策略配置 */
interface SecurityConfig {
    /** 密码最小长度 */
    passwordMinLength: number;
    /** 密码复杂度：low=仅长度 / medium=字母+数字 / high=大小写+数字+特殊字符 */
    passwordComplexity: 'low' | 'medium' | 'high';
    /** 登录失败锁定阈值（次） */
    loginFailThreshold: number;
    /** 账号锁定时长（分钟） */
    lockDuration: number;
}

/**
 * Turnstile 人机验证公开配置（来自 system_config.turnstile.config，已脱敏 secretKey）
 * - enabled: 总开关（关 = 不渲染 widget + 登录请求不带 token）
 * - siteKey: 前端 widget 用
 * - secretKey 字段**不会**出现在此处（后端 findPublic 已脱敏）
 */
export interface TurnstileConfig {
    enabled: boolean;
    siteKey: string;
}

export const useConfigStore = defineStore('config', () => {
    // ---- 加载状态 ----
    const isLoaded = ref(false);

    // ---- 系统基本信息 ----
    const systemBasic = reactive<SystemBasic>({
        name: 'Naive Admin',
        logo: '/hero.png',
        footerText: '© 2026 Naive Admin',
    });

    // ---- 界面配置 ----
    const uiConfig = reactive<UiConfig>({
        keepAliveMax: 10,
        requestTimeout: 10000,
    });

    // ---- 水印配置 ----
    const watermarkConfig = reactive<WatermarkConfig>({
        content: '{{username}} {{date}}',
    });

    // ---- 安全策略配置 ----
    const securityConfig = reactive<SecurityConfig>({
        passwordMinLength: 8,
        passwordComplexity: 'medium',
        loginFailThreshold: 5,
        lockDuration: 30,
    });

    /**
     * Turnstile 公开配置（enabled + siteKey）
     * - enabled=false → 登录页不渲染 widget，登录请求不带 turnstileToken 字段
     * - enabled=true + siteKey 有值 → 登录页渲染 widget，登录请求带 turnstileToken
     * - 后端 findPublic 已剔除 secretKey，前端**绝不可能**拿到 secretKey
     */
    const turnstileConfig = reactive<TurnstileConfig>({
        enabled: false,
        siteKey: '',
    });

    /**
     * 从后端加载全部配置并填充到本地状态
     *
     * @param configs  可选：已加载的配置列表。传入时跳过 API 请求，
     *                 与 settingsStore.loadAdminPreferences 共享同一份数据，
     *                 避免启动时重复调用 getConfigs()
     */
    async function loadConfigs(configs?: Awaited<ReturnType<typeof getConfigs>>) {
        if (isLoaded.value) return; // 防止重复加载

        try {
            const list = configs ?? (await getConfigs());

            // key="settings" 是一条记录，包含所有设置字段
            const settings = list.find((c) => c.key === 'settings');
            if (settings) {
                applySettings(settings.value);
            }

            // key="turnstile.config" 是一条记录，包含 enabled / siteKey / secretKey
            // 后端 findPublic 已脱敏 secretKey，前端只能拿到 enabled + siteKey
            const turnstile = list.find((c) => c.key === 'turnstile.config');
            if (turnstile) {
                applyTurnstileConfig(turnstile.value);
            }

            isLoaded.value = true;
        } catch (err) {
            // 加载失败时使用默认值，不影响应用启动
            console.warn('[ConfigStore] 加载配置失败，使用默认值:', err);
            isLoaded.value = true;
        }
    }

    /**
     * 把 turnstile.config 的 value 解析到响应式 state
     * - value 已脱敏（不含 secretKey），但为防御性编程，**显式只读 enabled + siteKey**
     * - 任一字段缺失时使用默认值（false / ""）
     */
    function applyTurnstileConfig(v: Record<string, unknown>) {
        turnstileConfig.enabled = v.enabled === true;
        turnstileConfig.siteKey = typeof v.siteKey === 'string' ? v.siteKey : '';
    }

    /**
     * 更新配置中心设置（供 SettingsPage 保存后同步到 store）
     *
     * 通过此 action 更新而非直接赋值 store 属性，确保所有更新路径一致。
     */
    function applySettings(v: Record<string, unknown>) {
        // 系统基本信息
        if (v.name) systemBasic.name = v.name as string;
        if (v.logo !== undefined) systemBasic.logo = v.logo as string;
        if (v.footerText) systemBasic.footerText = v.footerText as string;

        // 界面配置
        if (v.keepAliveMax !== undefined) uiConfig.keepAliveMax = v.keepAliveMax as number;
        if (v.requestTimeout !== undefined) uiConfig.requestTimeout = v.requestTimeout as number;

        // 同步到请求层的全局超时配置
        setRequestTimeout(uiConfig.requestTimeout);

        // 水印配置
        if (v.watermarkContent !== undefined) watermarkConfig.content = v.watermarkContent as string;

        // 安全策略配置
        if (v.passwordMinLength !== undefined) securityConfig.passwordMinLength = v.passwordMinLength as number;
        if (v.passwordComplexity !== undefined && ['low', 'medium', 'high'].includes(v.passwordComplexity as string))
            securityConfig.passwordComplexity = v.passwordComplexity as 'low' | 'medium' | 'high';
        if (v.loginFailThreshold !== undefined) securityConfig.loginFailThreshold = v.loginFailThreshold as number;
        if (v.lockDuration !== undefined) securityConfig.lockDuration = v.lockDuration as number;
    }

    return {
        isLoaded,
        systemBasic,
        uiConfig,
        watermarkConfig,
        securityConfig,
        turnstileConfig,
        loadConfigs,
        applySettings,
    };
});
