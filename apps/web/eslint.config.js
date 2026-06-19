import sharedConfig from '@packages/config/eslint';

export default [
    ...sharedConfig,
    {
        ignores: ['vitest.config.ts'],
    },
    {
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
];
