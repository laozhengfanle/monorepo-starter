import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

// 说明：代码规则由 oxlint 承担（见 .oxlintrc.json）。
// 本配置只保留 Nx 专属规则：模块边界与依赖一致性，通过 `pnpm lint:boundaries` 运行。
export default [
  ...nx.configs['flat/base'],
  {
    ignores: [
      '**/dist',
      '**/generated',
      '**/test-output',
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // 共享层只允许依赖共享层，禁止反向依赖应用
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
            // web 端只能依赖 web 端与共享层
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'] },
            // server 端只能依赖 server 端与共享层
            { sourceTag: 'scope:server', onlyDependOnLibsWithTags: ['scope:server', 'scope:shared'] },
          ],
        },
      ],
    },
  },
];
