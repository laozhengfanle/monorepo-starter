import { defineConfig } from 'orval';

/**
 * 从 openapi/openapi.json（由 server:generate-openapi 发射）生成类型化 React Query hooks。
 * 响应 envelope 的解包由 src/axios-instance.ts 的自定义 mutator 完成，
 * 生成代码直接返回领域类型（如 UserVo）。
 */
export default defineConfig({
  api: {
    input: {
      target: '../../../openapi/openapi.json',
      validation: false,
    },
    output: {
      mode: 'tags-split',
      target: './src/generated/api.ts',
      schemas: './src/generated/model',
      client: 'react-query',
      httpClient: 'axios',
      baseUrl: '/api',
      clean: true,
      override: {
        mutator: {
          path: './src/axios-instance.ts',
          name: 'customInstance',
        },
      },
    },
  },
});
