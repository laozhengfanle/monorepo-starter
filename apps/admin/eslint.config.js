import vueTsEslintConfig from '@vue/eslint-config-typescript';
import vueEslintConfig from 'eslint-plugin-vue';
import prettierConfig from '@vue/eslint-config-prettier';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default [
    {
        ignores: ['dist/', 'node_modules/', '*.bak'],
    },
    ...vueEslintConfig.configs['flat/recommended'],
    ...vueTsEslintConfig(),
    prettierConfig,
    {
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            'vue/multi-word-component-names': 'off',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
    },
];
