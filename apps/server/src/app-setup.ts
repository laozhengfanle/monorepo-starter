import 'reflect-metadata';

import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
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

/** 默认放行 admin 开发地址；生产环境通过 CORS_ORIGINS 显式配置 */
const DEFAULT_CORS_ORIGINS = ['http://localhost:3302'];

function corsOriginsFromEnv(): string[] {
  const raw = process.env['CORS_ORIGINS'];
  if (!raw) {
    return DEFAULT_CORS_ORIGINS;
  }
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_CORS_ORIGINS;
}

/**
 * 创建已装配的应用实例（不监听端口，无副作用——可被 e2e 测试安全导入）：
 * - Express 适配器（NestJS 官方默认）
 * - pino 结构化日志（bufferLogs + useLogger，requestId 串联）
 * - helmet（安全头）/ compression（响应压缩）/ cookieParser
 * - 全局 Zod 校验管道（ZodError → AllExceptionsFilter → 422 envelope）
 * - 全局异常过滤器（失败统一 envelope 响应）
 * - CORS 白名单（CORS_ORIGINS，默认 admin 开发地址）
 * - Swagger UI + JSON 端点
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: corsOriginsFromEnv() });
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
