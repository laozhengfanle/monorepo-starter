/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@starter/ui',
    globals: true,
    environment: 'jsdom',
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
