/**
 * 应用启动入口 — C端（会员端）
 *
 * 启动顺序：
 *   1. installGlobalFetch() — 包装 window.fetch（401 自动刷新 + CSRF 注入）
 *   2. createApp(App) — 创建 Vue 应用实例
 *   3. createPinia() + piniaPluginPersistedstate + restoreFromStorage(pinia)
 *      - 同步恢复 store 的持久化数据，防止首屏闪烁
 *   4. app.use(pinia) — 注册 Pinia 状态管理
 *   5. app.use(router) — 注册 Vue Router
 *   6. app.mount('#app') — 挂载到 index.html 的 #app 节点
 *
 * 注意：
 *   - fetch 包装必须在 createApp 之前完成，
 *     这样 GraphQL client / 路由守卫 / 任何初始化逻辑都用到包装后的 fetch
 *   - Pinia 必须在 Router 之前注册，
 *     因为路由守卫中需要调用 useAuthStore() 访问用户登录状态
 *   - 持久化恢复（restoreFromStorage）必须在 app.use(pinia) 之前，
 *     否则首屏渲染会先看到默认值再切到持久化值，造成闪烁
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import App from './App.vue';
import router from './app/router';
import { installGlobalFetch } from './api/fetch';
import './style.css';

// ── 1. 包装全局 fetch（CRITICAL F3 + F4 修复）──
// 必须在 createApp 之前：所有初始化逻辑（GraphQL client、auth store 初始化等）都要用包装后的 fetch
installGlobalFetch();

const app = createApp(App);

// ── 2. Pinia + 持久化插件 ──
// pinia-plugin-persistedstate v4 自动在每个 store
// 创建时同步从 localStorage/sessionStorage 恢复状态（hydration），
// 由于 hydration 发生在 store setup 阶段（app.use(pinia) 后、mount 前），
// 首屏渲染就能拿到持久化数据，不会出现「默认值 → 持久化值」的闪烁。
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(pinia);

// 不做 i18n（CLAUDE.md 明确禁止）— 唯一目标语言是简体中文，文案直接硬编码
// 之前的 createI18n / DEFAULT_LOCALE 引用已全部移除

// 注册 Vue Router
app.use(router);

// 挂载应用
app.mount('#app');

// ── dev 模式启动横幅 ──
// - 只在 dev 环境打印，避免生产 console 噪声
// - 同时告知后端 API 和 Swagger 文档的入口，避免新人 onboarding 时找不到 API 文档
if (import.meta.env.DEV) {
    const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';
    const serverPort = (import.meta.env.VITE_SERVER_PORT as string | undefined) ?? '3000';
    // 推断后端 HTTP 地址：开发环境常见为 http://localhost:3000（同源时 apiBase 为 /api，端口依然 3000）
    const serverBase = apiBase.startsWith('http') ? apiBase : `http://localhost:${serverPort}`;

    console.info(
        `%c📘 后端 Swagger UI：${serverBase}/api/docs\n%c📄 OpenAPI JSON：${serverBase}/api/docs-json`,
        'color: #1e88e5; font-weight: bold',
        'color: #1e88e5',
    );
}
