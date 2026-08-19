import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * GraphQL codegen：从后端 schema.gql + admin 的 .graphql operations 生成类型化 Apollo hooks。
 *
 * 双输出（codegen 7 推荐结构，避免 schema 类型与 operation 类型重复定义）：
 * - graphql-types.ts：typescript 插件生成 schema 类型（input/enum/scalars）——唯一来源；
 * - graphql.ts：typescript-operations + typescript-react-apollo 生成操作类型与 hooks，
 *   通过 importSchemaTypesFrom 从 graphql-types.ts 导入 schema 类型（该值是 cwd 相对路径）。
 *
 * 使用：pnpm exec graphql-codegen
 */
const config: CodegenConfig = {
  schema: '../server/graphql/schema.gql',
  documents: ['src/**/*.graphql'],
  generates: {
    'src/generated/graphql-types.ts': {
      plugins: ['typescript'],
      config: {
        skipTypename: true,
      },
    },
    'src/generated/graphql.ts': {
      plugins: ['typescript-operations', 'typescript-react-apollo'],
      config: {
        importSchemaTypesFrom: 'src/generated/graphql-types',
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
