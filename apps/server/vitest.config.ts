import { defineConfig } from 'vitest/config';

/**
 * Vitest 配置
 *
 * 使用项目根目录下源码的相对路径导入，不配置 @ 别名
 * （tsconfig paths 在 tsx/build/vitest 三个工具间存在兼容性差异，
 *  改用相对路径更可靠 —— 见 scripts/revert-aliases.mjs）
 */
export default defineConfig({
    test: {
        globals: true,
        include: ['src/**/__tests__/*.spec.ts'],
    },
});
