/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/admin',
  server: {
    port: 3302,
    // 0.0.0.0：同时监听 IPv4 与 IPv6，避免浏览器访问 127.0.0.1 时被拒
    host: '0.0.0.0',
    proxy: {
      // 开发代理：/api/* → server（3301），转发时剥离 /api 前缀
      '/api': {
        target: 'http://localhost:3301',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    port: 3302,
    host: '0.0.0.0',
  },
  plugins: [react()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: '@starter/admin',
    watch: false,
    globals: true,
    environment: 'jsdom',
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.{ts,tsx}'],
    },
  },
}));
