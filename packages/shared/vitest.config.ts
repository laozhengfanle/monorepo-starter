import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        /** 测试文件匹配模式 */
        include: ['src/**/*.spec.ts'],
        coverage: {
            /** 覆盖率包含所有源文件（不仅仅是测试导入的） */
            include: ['src/**/*.ts'],
            /** 排除测试文件、index 导出文件、纯类型文件 */
            exclude: ['src/**/*.spec.ts', 'src/index.ts', 'src/**/__tests__/**'],
        },
    },
});
