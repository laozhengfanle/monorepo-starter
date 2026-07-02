import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { MotionPlugin } from '@vueuse/motion';
import App from './App.vue';
import router from './app/router';
import permissionDirective from './shared/directives/permission';
import { sanitizeHtml } from '@/shared/utils/security';
import { useConfigStore } from '@/shared/stores/config';
import { useSettingsStore } from '@/shared/stores/settings';
import { getPublicConfigs } from '@/api/configs';
// wangEditor v5 基础样式（工具栏/编辑器/弹窗），必须在 style.css 之前
import '@wangeditor/editor/dist/css/style.css';
import './style.css';

/**
 * 应用启动入口
 *
 * 应用启动后，所有 API 请求直接走真实后端（Vite proxy 转发 /api 与 /graphql 到 NestJS 服务）。
 *
 * Pinia 持久化：
 *   - pinia-plugin-persistedstate v4 在 store 创建时同步从 storage 恢复
 *   - 由于 store 是在 app.use(pinia) 后、mount 前才被 useXxxStore() 调用，
 *     所以首屏渲染就能拿到持久化数据，不会闪烁
 */
async function bootstrap() {
    const app = createApp(App);
    const pinia = createPinia();

    // 注册持久化插件
    // v4 行为：每个 store 在 setup 阶段同步从 storage 恢复（hydration）
    pinia.use(piniaPluginPersistedstate);

    app.use(pinia);

    // 不做 i18n（CLAUDE.md 明确禁止）— 唯一目标语言是简体中文，文案直接硬编码
    // 之前的 vue-i18n / createI18n / watch(locale) 全部移除

    app.use(router);
    app.use(MotionPlugin);

    // 注册 v-permission 指令
    app.directive('permission', permissionDirective);

    // 注册 v-raw-html 指令 — 将绑定值渲染到元素 innerHTML。
    //
    // 安全策略：默认对内容进行 HTML 转义（防 XSS），使用 .trusted 修饰符时跳过转义。
    //
    // 用法：
    //   <div v-raw-html="userInput" />              → 自动转义，安全
    //   <div v-raw-html.trusted="trustedHtml" />    → 跳过转义，仅用于开发者硬编码的受信内容
    //
    // ⚠️ .trusted 修饰符与 v-html 安全性等同，不做任何输入消毒。
    // 绝不应对用户输入或外部数据源使用 .trusted。
    app.directive('raw-html', (el, binding) => {
        // binding.modifiers.trusted 为 true 时跳过消毒（开发者确认内容可信）
        const content = String(binding.value);
        el.innerHTML = binding.modifiers.trusted ? content : sanitizeHtml(content);
    });

    // 加载全局配置（系统名称、Logo、水印、界面设置等）
    // Pinia 已注册，可以安全使用 store
    //
    // getConfigs() 仅调用一次，结果共享给 configStore 和 settingsStore，
    // 避免启动时重复请求同一 API
    const configStore = useConfigStore();
    const settingsStore = useSettingsStore();

    try {
        // 引导阶段只加载公开配置（系统名/logo/footer 等无敏感信息的 key）
        // 敏感配置（OAuth 凭据/SMS key/Turnstile secret 等）须登录后才能加载，详见 getPrivateConfigs
        const configs = await getPublicConfigs();
        await Promise.all([configStore.loadConfigs(configs), settingsStore.loadAdminPreferences(configs)]);
    } catch (err) {
        // 即使配置加载失败也继续启动（使用默认值）
        console.warn('[Main] 加载配置失败，使用默认值:', err);
        await Promise.all([configStore.loadConfigs([]), settingsStore.loadAdminPreferences([])]);
    }

    // 设置浏览器标题（优先使用后端配置的系统名称）
    document.title = configStore.systemBasic.name || import.meta.env.VITE_APP_TITLE;

    // Vue 全局错误处理
    // 捕获组件渲染错误、生命周期错误、事件处理器错误等，
    // 防止未处理的异常导致白屏。生产环境可接入错误上报服务（如 Sentry）。
    app.config.errorHandler = (err, instance, info) => {
        console.error('[Vue Error]', {
            error: err,
            component: instance?.$options?.name || 'Anonymous',
            info,
        });
    };

    // 捕获 Vue 组件内未被 errorHandler 拦截的警告（如 props 校验失败）
    // 生产环境不输出警告，此处仅在开发环境生效
    const originalWarn = app.config.warnHandler;
    app.config.warnHandler = (msg, instance, trace) => {
        console.warn(`[Vue Warn] ${msg}`, {
            component: instance?.$options?.name || 'Anonymous',
            trace,
        });
        // 保留原有 warnHandler（如有）
        originalWarn?.call(app, msg, instance, trace);
    };

    app.mount('#app');

    // mount 完成后再移除 loading，避免 mount 前出现空白
    document.getElementById('app-loading')?.remove();
}

bootstrap();
