import { Module } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { unwrapResolverError } from '@apollo/server/errors';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildDataLoaders,
  type DataLoaders,
} from '../dataloader/dataloader.factory.js';
import { BigIntScalar } from './bigint.scalar.js';
import { JsonScalar } from './json.scalar.js';

/**
 * GraphQL 请求上下文：req/res + 每请求独立的 DataLoader 实例
 */
export interface GraphQLContext {
  req: Request;
  res: Response;
  /** N+1 优化：同一请求内多次 load 相同 key 只查一次（菜单树/角色码） */
  dataloaders: DataLoaders;
}

/**
 * GraphQL 模块（应用级，Code-First 模式）。
 *
 * 挂载 Apollo Server 驱动 + 自动生成 schema.gql + 统一错误映射。
 * - DataLoader：每请求注入 dataloaders（菜单树/角色码批量查询，修复 N+1）
 * - 自定义 Scalar：JSON + BigInt
 * - 安全规则（深度/复杂度限制）在后续阶段接入。
 */
@Module({
  imports: [
    NestGraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: (prisma: PrismaService) => ({
        // 自动生成 schema.gql，便于 review 完整 schema（生成物，勿手改）
        autoSchemaFile: join(process.cwd(), 'graphql/schema.gql'),
        sortSchema: true,
        // 生产关闭内省；playground 用 Apollo Sandbox（dev 通过 /graphql 访问）
        introspection: process.env.NODE_ENV !== 'production',
        playground: false,
        /**
         * GraphQL context：注入 req/res（JWT Guard 需要读取 header）
         * + 每请求独立的 DataLoader 实例（避免跨请求缓存污染）。
         * - DataLoader 通过 useFactory 注入的 PrismaService 构建
         * - 每个请求独立实例 → 不跨请求缓存
         */
        context: ({
          req,
          res,
        }: {
          req: Request;
          res: Response;
        }): GraphQLContext => ({
          req,
          res,
          dataloaders: buildDataLoaders(prisma),
        }),
        /**
         * 统一错误映射：把业务异常（BizException）与 ZodArgsPipe 的校验错误，
         * 归一化为 { message, extensions: { code, fields } } 结构。
         * - ZodArgsPipe 抛的 GraphQLError：extensions.code/fields 直接透传
         * - BizException（非 HttpException）：unwrapResolverError 取原始异常，读其 code/message
         */
        formatError: (formattedError, error) => {
          const exception = unwrapResolverError(error) as
            { code?: string; message?: string } | undefined;
          const original = formattedError.extensions ?? {};
          return {
            message: exception?.message ?? formattedError.message,
            extensions: {
              code:
                exception?.code ??
                (typeof original.code === 'string'
                  ? original.code
                  : 'INTERNAL_SERVER_ERROR'),
              fields: original.fields ?? null,
            },
          };
        },
      }),
      inject: [PrismaService],
    }),
  ],
  providers: [JsonScalar, BigIntScalar],
})
export class GraphQLModule {}
