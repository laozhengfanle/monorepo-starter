import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';
// vite.config.ts
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';

// 从 monorepo 根 package.json 读取版本号，统一版本管理
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

// https://vitejs.dev/config/
export default defineConfig({
    define: {
        // 应用版本号（从 package.json 注入，生产构建也会保留）
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
        vue(),
        tailwindcss(),
        AutoImport({
            imports: [
                'vue',
                {
                    'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar'],
                },
            ],
        }),
        Components({
            resolvers: [NaiveUiResolver()],
        }),
        /**
         * bundle 可视化（可选）
         * - 通过 `BUNDLE_ANALYZE=true pnpm build` 触发
         * - 输出 dist/stats.html，可用浏览器打开查看模块占比
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
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    /**
     * 安全响应头配置
     *
     * - X-Content-Type-Options: nosniff — 防止 MIME 嗅探，浏览器严格遵循 Content-Type
     * - X-Frame-Options: DENY — 防止点击劫持，禁止 iframe 嵌入
     * - X-XSS-Protection: 0 — 关闭浏览器内置 XSS 过滤器（现代浏览器已弃用，反而可能被利用）
     * - Referrer-Policy: strict-origin-when-cross-origin — 控制 Referer 泄露
     * - Permissions-Policy — 限制浏览器 API 权限（摄像头、麦克风、地理位置等）
     * - Content-Security-Policy — 内容安全策略，限制脚本/样式/图片等资源加载来源
     *
     * ⚠️ 生产环境 CSP 注意事项：
     *
     * 当前 CSP 仅在 Vite dev server 生效（server.headers），生产环境需由反向代理下发。
     * 以下是 Nginx 生产环境 CSP 示例（比开发环境更严格）：
     *
     *   add_header Content-Security-Policy "
     *     default-src 'self';
     *     script-src 'self' https://challenges.cloudflare.com;
     *     style-src 'self' 'unsafe-inline';
     *     connect-src 'self' https://your-api-domain.com;
     *     frame-src https://challenges.cloudflare.com;
     *     img-src 'self' data: blob:;
     *     font-src 'self' data:;
     *     frame-ancestors 'none';
     *   " always;
     *   add_header X-Content-Type-Options "nosniff" always;
     *   add_header X-Frame-Options "DENY" always;
     *   add_header X-XSS-Protection "0" always;
     *   add_header Referrer-Policy "strict-origin-when-cross-origin" always;
     *   add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
     *
     * 关键差异：
     *   - 移除 'unsafe-eval'（生产环境不需要动态代码执行）
     *   - connect-src 从 * 改为具体 API 域名（防止数据外泄）
     *   - style-src 保留 'unsafe-inline'（Naive UI 运行时注入内联样式）
     */
    optimizeDeps: {
        exclude: ['@vueuse/motion'],
    },
    server: {
        /**
         * Vite Proxy — 开发期把前端请求转发到 NestJS 后端
         *
         * 前端请求路径：
         *   - REST：/api/... （如 /api/admin/auth/login, /api/auth/refresh）
         *   - GraphQL：/graphql （如 query { adminConfigs { ... } }）
         *
         * 转发目标：http://localhost:3000 （NestJS 后端 dev server）
         *
         * 注意：
         *   1. 后端必须运行在 :3000，否则前端会得到 502/504 错误
         *   2. 生产环境不走 Vite proxy，由 Nginx/反代直接转发
         *   3. changeOrigin=true 解决跨域 Origin header 转发问题
         *   4. secure=false 允许 http 请求（开发环境是 http，后端是 https 时才设为 true）
         */
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
            /**
             * 头像 / 通用文件访问 — 开发期把 /uploads/* 转发到 NestJS 静态文件托管
             * （后端在 main.ts 用 useStaticAssets 暴露 ./uploads 目录，prefix /uploads/）
             * - 不加这条代理：浏览器加载 /uploads/avatars/xxx.png 会拿到 404（Vite dev server 找不到该文件），
             *   导致 <n-avatar> 触发 onError 回退到 fallback-src，显示项目 logo 而非真实头像
             * - 生产环境：Vite proxy 不参与，由反向代理层（Nginx / Cloudflare）转发 /uploads/*
             */
            '/uploads': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
        },
        headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '0',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            /**
             * 开发环境 CSP 策略
             *
             * 开发环境使用宽松策略（connect-src 设为 *），
             * 这样 Vite dev server 的 HMR WebSocket 与 Vite API 都能正常工作，
             * 同时也允许 Cloudflare Turnstile 之类的第三方服务建立连接。
             * 生产环境应由反向代理（Nginx/Cloudflare）下发严格 CSP。
             */
            'Content-Security-Policy': [
                "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
                // 允许 Cloudflare Turnstile 脚本加载
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
                // 允许所有连接（开发环境 HMR / Turnstile / 本地后端联调都需要）
                'connect-src *',
                // 允许 Cloudflare Turnstile iframe
                'frame-src https://challenges.cloudflare.com',
                "img-src 'self' data: blob:",
                "font-src 'self' data:",
                "frame-ancestors 'none'",
            ].join('; '),
        },
    },
    build: {
        // 启用 sourcemap 便于生产调试
        // （注意：admin 之前用的是 vite-plugin-bundlesize + sourcemap:'hidden'，
        //   但该插件 0.3.0 与 vite 8 + rolldown 的 sourcemap 格式不兼容，
        //   详见 https://github.com/javiertury/vite-plugin-bundlesize 是否有 rolldown 适配。
        //   现已移除该插件，bundle 大小监控改用 BUNDLE_ANALYZE=true pnpm build 看 dist/stats.html）
        sourcemap: true,
        chunkSizeWarningLimit: 500,
        rollupOptions: {
            output: {
                manualChunks(id: string) {
                    if (id.includes('node_modules/naive-ui')) return 'naive-ui';
                    if (
                        id.includes('node_modules/vue') ||
                        id.includes('node_modules/pinia') ||
                        id.includes('node_modules/vue-router')
                    )
                        return 'vue-vendor';
                    if (id.includes('node_modules/@vueuse')) return 'vueuse';
                },
            },
        },
    },
});
