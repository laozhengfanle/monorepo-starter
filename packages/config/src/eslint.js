import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
        /* Vue 文件需要指定 @typescript-eslint/parser 作为脚本块的子解析器，否则无法解析 TypeScript 语法（如 as 类型断言、泛型） */
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
                /* 允许 typescript-eslint 自动查找 .vue 文件对应的 tsconfig 项目 */
                projectService: true,
                extraFileExtensions: ['.vue'],
            },
        },
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                /* 使用 projectService 自动查找每个文件对应的 tsconfig，避免手动配置 project 导致 .vue 文件找不到项目 */
                projectService: true,
                /* monorepo 下有多个候选 tsconfigRootDir（apps/admin、apps/server、packages/shared 等），必须显式指定，否则 parser 会抛错 */
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            /* 页面级组件（如 index.vue、login.vue）使用单词命名是常见做法，关闭此规则 */
            'vue/multi-word-component-names': 'off',
        },
    },
    /**
     * 关闭所有与 Prettier 冲突的 ESLint 格式规则
     * - 必须放在最后，确保 prettier 的关闭规则覆盖前面所有插件的格式规则
     */
    prettierConfig,
];
