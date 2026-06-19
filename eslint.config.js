import config from '@packages/config/eslint';

export default [
    ...config,
    {
        ignores: [
            '**/generated/',
            '**/dist/',
            '**/node_modules/',
            '**/vitest.config.ts',
            '**/prisma.config.ts',
            '**/prisma/seed.ts',
            // 根目录下的 playwright.config.ts 不在 root tsconfig.json 的 include 里，
            // project service 找不到项目会报 Parsing error，单独 ignore
            'playwright.config.ts',
        ],
    },
];
