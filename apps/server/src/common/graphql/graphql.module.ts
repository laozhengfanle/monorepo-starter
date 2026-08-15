import { Module } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { unwrapResolverError } from '@apollo/server/errors';
import type { Request, Response } from 'express';
import { join } from 'node:path';

/**
 * GraphQL 模块（应用级，Code-First 模式）。
 *
 * 阶段 2 精简版：挂载 Apollo Server 驱动 + 自动生成 schema.gql + 统一错误映射。
 * 安全规则（深度/复杂度限制、生产内省关闭、字段建议脱敏、DataLoader、超时）在后续阶段接入。
 */
@Module({
  imports: [
    NestGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // 自动生成 schema.gql，便于 review 完整 schema（生成物，勿手改）
      autoSchemaFile: join(process.cwd(), 'graphql/schema.gql'),
      sortSchema: true,
      // 生产关闭内省；playground 用 Apollo Sandbox（dev 通过 /graphql 访问）
      introspection: process.env.NODE_ENV !== 'production',
      playground: false,
      /**
       * GraphQL context：注入 req/res（JWT Guard 需要读取 header）
       */
      context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
      /**
       * 统一错误映射：把业务异常（BizException）与 ZodArgsPipe 的校验错误，
       * 归一化为 { message, extensions: { code, fields } } 结构。
       * - ZodArgsPipe 抛的 GraphQLError：extensions.code/fields 直接透传
       * - BizException（非 HttpException）：unwrapResolverError 取原始异常，读其 code/message
       */
      formatError: (formattedError, error) => {
        const exception = unwrapResolverError(error) as
          | { code?: string; message?: string }
          | undefined;
        const original = formattedError.extensions ?? {};
        return {
          message: exception?.message ?? formattedError.message,
          extensions: {
            code:
              exception?.code ??
              (typeof original.code === 'string' ? original.code : 'INTERNAL_SERVER_ERROR'),
            fields: original.fields ?? null,
          },
        };
      },
    }),
  ],
})
export class GraphQLModule {}
