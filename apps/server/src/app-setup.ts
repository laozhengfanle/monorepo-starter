import 'reflect-metadata';

import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AllExceptionsFilter,
  configureSwagger,
  createOpenApiDocument,
} from '@starter/server-core';
import { AppModule } from './app/app.module.js';

export const DEFAULT_PORT = 3301;

/** 上传文件静态目录（与 upload.controller 的 UPLOAD_DIR 一致） */
const UPLOAD_DIR = path.resolve(process.env['UPLOAD_DIR'] ?? 'uploads');

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // 信任一层反向代理：Express 从受信 X-Forwarded-For 解析真实客户端 IP（req.ip），
  // 供 IP 锁定/限流/审计使用，防止客户端伪造 XFF 头绕过（此前 XFF 首段被无条件采信）。
  // 生产环境若代理层数变化（如 LB → nginx 两层），请按实际跳数调整该值（如 trust proxy 2）。
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  // 上传文件静态访问：/uploads/{storedName}
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  app.use('/uploads', express.static(UPLOAD_DIR));
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
