import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/** Swagger UI 路径 */
export const SWAGGER_PATH = 'api-docs';
/** 机器可读的 OpenAPI JSON 路径（codegen 输入） */
export const SWAGGER_JSON_PATH = 'api-docs-json';

const API_TITLE = 'monorepo-starter API';
const API_DESCRIPTION = '企业级 monorepo starter 的 NestJS + Fastify API';
/** API 版本（与根 package.json 保持一致，健康检查与 Swagger 共用） */
export const API_VERSION = '0.1.0';

/**
 * 生成经 nestjs-zod 清理后的 OpenAPI 文档（zod DTO 的 schema 需清理才能正确输出）。
 */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle(API_TITLE)
    .setDescription(API_DESCRIPTION)
    .setVersion(API_VERSION)
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/** 挂载 Swagger UI（/api-docs）与 JSON 端点（/api-docs-json） */
export function configureSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, createOpenApiDocument(app), {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
  });
}
