/**
 * Vitest 配置
 *
 * 前端单元测试配置：
 *   - 使用 happy-dom 模拟浏览器环境
 *   - 支持 @/ 路径别名
 *   - 覆盖率报告输出到 coverage/ 目录
 */
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            // pnpm workspace 包别名：指向 shared 包的构建产物，供测试环境解析
            '@packages/shared': resolve(__dirname, '../../packages/shared/dist/index.js'),
        },
    },
    test: {
        // 使用 happy-dom 模拟浏览器环境（比 jsdom 更快）
        environment: 'happy-dom',
        /**
         * 禁用外部 JavaScript 文件自动加载
         * - 单元测试不应真实请求 CDN 脚本（如 Cloudflare Turnstile）
         * - 脚本加载失败会触发 onerror，组件内会降级到 mock 模式
         * - 避免 happy-dom teardown 时因待处理 fetch 而抛 NetworkError
         */
        environmentOptions: {
            happyDOM: {
                settings: {
                    disableJavaScriptFileLoading: true,
                },
            },
        },
        // 全局 API（describe/it/expect 等）无需每次 import
        globals: true,
        // 覆盖率配置
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.{ts,vue}'],
            exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/types.ts', 'src/**/types/**'],
        },
        // 包含的测试文件
        include: ['src/**/*.spec.ts'],
    },
});
