import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AllExceptionsFilter,
  configureSwagger,
  createOpenApiDocument,
} from '@starter/server-core';
import { AppModule } from './app/app.module.js';

export const DEFAULT_PORT = 3301;

/**
 * 创建已装配的应用实例（不监听端口，无副作用——可被 e2e 测试安全导入）：
 * - Fastify 适配器
 * - 全局 Zod 校验管道（ZodError → AllExceptionsFilter → 422 envelope）
 * - 全局异常过滤器（统一 envelope 响应）
 * - Swagger UI + JSON 端点
 */
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();
  configureSwagger(app);
  await app.init();
  return app;
}

/**
 * 发射 OpenAPI JSON 到文件后退出（不监听端口）：
 * 供 Orval codegen 使用——构建产物直接生成 spec。
 */
export async function emitOpenApi(outPath: string): Promise<void> {
  const app = await createApp();
  try {
    const document = createOpenApiDocument(app);
    const target = path.resolve(process.cwd(), outPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  } finally {
    await app.close();
  }
}
