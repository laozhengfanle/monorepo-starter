import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * GraphQL codegen：从后端 schema.gql + admin 的 .graphql operations 生成类型化 Apollo hooks。
 *
 * 使用：pnpm exec nx run @starter/admin:generate-graphql（或 graphql-codegen）
 */
const config: CodegenConfig = {
  schema: '../server/graphql/schema.gql',
  documents: ['src/**/*.graphql'],
  generates: {
    'src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-operations', 'typescript-react-apollo'],
      config: {
        withHooks: true,
        // 生成的 hooks 命名去掉冗余后缀，与 operations 名一致
        withComponent: false,
        withHOC: false,
        withRefetchFn: false,
      },
    },
  },
};

export default config;
