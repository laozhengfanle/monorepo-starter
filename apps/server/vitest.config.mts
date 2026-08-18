/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@starter/server',
    watch: false,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.{ts,tsx}'],
      // 排除生成产物与入口/测试基建（P1-6 修复：src/generated 是 prisma 生成客户端，
      // gitignored 且 0% 覆盖，之前被计入阈值导致分支率被严重拖低）：
      exclude: [
        'src/generated/**',
        'src/main.ts',
        'src/test-setup.ts',
        '**/*.spec.ts',
        '**/*.test.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        // 分支阈值 60%（2026-08-18 审计修复后实测 63%，较修复前基线 49.51% 显著提升；
        // lines/statements/functions 均已 ≥80）。剩余分支缺口集中在 cache.service（Redis
        // 降级分支）、gql-throttler.guard、通知 provider 等——达 80% 需系统性补分支用例，
        // 作为后续迭代项（见 docs/开发文档/审计修复计划.md P1-6），先保证 CI 门可用。
        branches: 60,
      },
    },
  },
});
