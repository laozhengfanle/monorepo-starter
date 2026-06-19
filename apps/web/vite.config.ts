/**
 * Vite 配置 — C端（会员端）应用
 *
 * 本文件负责：
 *   1. 启用 Vue SFC 编译（@vitejs/plugin-vue）
 *   2. 启用 Tailwind CSS v4（@tailwindcss/vite 插件）
 *   3. 启用 Naive UI 按需自动引入（unplugin-vue-components + NaiveUiResolver）
 *   4. 启用 Vue / Pinia / vue-router API 的自动 import（unplugin-auto-import）
 *   5. 配置 @/* 路径别名
 *   6. 配置 Vite Proxy（开发期 /api、/graphql 转发到 NestJS 后端）
 *   7. 配置 bundle size 限制（vite-plugin-bundlesize）
 *   8. 配置 bundle 分析（rollup-plugin-visualizer）
 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import tailwindcss from '@tailwindcss/vite';
import bundlesize from 'vite-plugin-bundlesize';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        /**
         * Vue 插件：让 .vue 单文件组件可以被 Vite 处理
         * 必须在所有其他插件之前
         */
        vue(),
        /**
         * Tailwind CSS v4 插件：
         *   - 自动扫描 .vue / .ts / .css 文件
         *   - 替代旧版的 postcss 配置
         */
        tailwindcss(),
        /**
         * AutoImport：自动 import Vue / Pinia / vue-router 的常用 API
         *   - 这样在 .vue 中不用每次都写 import { ref, computed } from 'vue'
         *   - naive-ui 提供的 useDialog / useMessage 等也支持按需引入
         */
        AutoImport({
            imports: [
                'vue',
                'vue-router',
                'pinia',
                {
                    'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar'],
                },
            ],
        }),
        /**
         * Components：自动注册组件
         *   - NaiveUiResolver 让 <n-button>、<n-card> 等无需手动 import
         *   - 写模板时直接用 <n-button />，构建时自动注入 import
         */
        Components({
            resolvers: [NaiveUiResolver()],
        }),
        /**
         * bundle size 限制
         * - main 入口 ≤ 200KB / vendor 拆包 ≤ 500KB / 整体 ≤ 1MB（gzip 模式）
         * - 超限 → vite build 失败（不让超大包进入生产）
         * - 顺序：从最具体到最宽松（vite-plugin-bundlesize 顺序敏感）
         * - 注意：index.html 等非 JS 资源不会被匹配，跳过即可
         * - limits 单位：kB / KB / MB 都支持，这里用 kB 显式声明
         */
        bundlesize({
            limits: [
                { name: 'assets/index-*.js', limit: '200 kB', mode: 'gzip' },
                { name: 'assets/vue-vendor-*.js', limit: '500 kB', mode: 'gzip' },
                { name: 'assets/naive-ui-*.js', limit: '500 kB', mode: 'gzip' },
                { name: 'assets/vendor-*.js', limit: '500 kB', mode: 'gzip' },
                { name: '**/*.js', limit: '1 MB', mode: 'gzip' },
            ],
            /** 默认 false：超限直接让 build 失败 */
            allowFail: false,
            stats: 'summary',
        }),
        /**
         * bundle 可视化（可选，默认不启用）
         * - 通过 BUNDLE_ANALYZE=true pnpm build 触发（见 scripts）
         * - 输出 stats.html 到 dist/，可用浏览器打开查看模块占比
         * - 平时 vite build 不启用，避免污染 dist
         */
        ...(process.env['BUNDLE_ANALYZE'] === 'true'
            ? [
                  visualizer({
                      filename: 'dist/stats.html',
                      open: false,
                      gzipSize: true,
                      brotliSize: true,
                  }),
              ]
            : []),
    ],

    /**
     * 路径别名
     *   - 配合 tsconfig.app.json 的 paths 使用
     *   - Vite 在 import 解析阶段把 @/foo 替换成 src/foo
     */
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },

    /**
     * 预构建依赖：让 Vite 在 dev 启动前预打包这些大依赖
     *   - 避免每次冷启动都重新打包，影响性能
     *   - 解决 naive-ui 在 dev 阶段的 CJS/ESM 兼容问题
     */
    optimizeDeps: {
        include: ['naive-ui'],
    },

    /**
     * Vite Proxy — 开发期把前端请求转发到 NestJS 后端
     *
     * 前端请求路径：
     *   - REST：/api/... （如 /api/member/auth/sms/send, /api/auth/refresh）
     *   - GraphQL：/graphql （如 query { me { ... } }）
     *
     * 转发目标：http://localhost:3000 （NestJS 后端 dev server）
     *
     * 注意：
     *   1. 后端必须运行在 :3000，否则前端会得到 502/504 错误
     *   2. 生产环境不走 Vite proxy，由 Nginx/反代直接转发
     *   3. changeOrigin=true 解决跨域 Origin header 转发问题
     */
    server: {
        port: 5174,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
            '/graphql': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
        },
    },

    /**
     * Vite Preview 端口
     *   - pnpm preview 时使用
     *   - 与 dev 端口区分（4174 是 Vite preview 的默认推荐值）
     */
    preview: {
        port: 4174,
    },

    /**
     * 构建配置
     * - sourcemap: 'hidden' 让 vite-plugin-bundlesize 能计算精确的 bundle size
     *   （hidden 表示生成 .map 文件但不在产物末尾添加 sourcemap 注释）
     * - chunkSizeWarningLimit: vite 默认 500kB 警告阈值，与 bundlesize 限制一致
     */
    build: {
        sourcemap: 'hidden',
        chunkSizeWarningLimit: 500,
    },
});
