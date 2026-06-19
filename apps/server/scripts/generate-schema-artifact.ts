/**
 * Schema Artifact Generator
 *
 * 用途：
 *   - 在 `pnpm build` 之后跑，生成 `dist/schema.gql`（GraphQL SDL）和
 *     `dist/openapi.json`（REST API 描述）
 *   - 生成的 artifact 提交到 Git 供 CI / SDK 生成器 / 前端 codegen 消费
 *   - 配合 `pnpm schema:check` 可以在 CI 里校验 artifact 与当前源码一致
 *
 * 实现思路：
 *   - 利用 NestJS GraphQL 的 `autoSchemaFile` 机制：NestFactory.create 启动 AppModule 时，
 *     GraphQLModule 会自动把 SDL 写入 `apps/server/graphql/schema.gql`（已在 graphql.module.ts 配置）
 *   - 我们 bootstrap 应用（不 listen 端口），等 GraphQL 模块把 schema 写盘后，从源位置读到 `dist/schema.gql`
 *   - OpenAPI 描述 JSON 是手写维护的精简版（与现有 REST 端点对齐），不依赖 @nestjs/swagger
 *     （引入 swagger 会要求改业务 controller，超出本任务边界）
 *
 * 用法：
 *   pnpm generate:schema
 *
 * 顺序：
 *   pnpm build
 *   pnpm generate:schema
 *   git add dist/schema.gql dist/openapi.json
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { constants as FS_CONST } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ───── 路径常量（相对 apps/server 目录）─────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** 项目根目录（apps/server） */
const SERVER_ROOT = resolve(__dirname, '..');
/** NestJS GraphQL 自动生成的 SDL 位置（见 src/modules/graphql/graphql.module.ts） */
const GRAPHQL_SCHEMA_SOURCE = join(SERVER_ROOT, 'graphql', 'schema.gql');
/** 输出目录（nest build 的产物位置） */
const DIST_DIR = join(SERVER_ROOT, 'dist');
/** GraphQL SDL 产物 */
const DIST_SCHEMA_GQL = join(DIST_DIR, 'schema.gql');
/** OpenAPI 描述产物 */
const DIST_OPENAPI_JSON = join(DIST_DIR, 'openapi.json');

/**
 * 检查文件是否存在
 * @param path 文件路径
 * @returns true 表示存在
 */
async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path, FS_CONST.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * 启动 NestJS 应用（不 listen）触发 GraphQL schema 自动生成
 * - 设置 dummy 环境变量，让 Zod 校验通过
 * - 抑制所有 logger 输出（CI 日志干净）
 * - 等待 GraphQLModule 把 SDL 写盘
 * - 即使 Prisma 连库失败也不影响 schema 生成
 */
async function bootstrapAppForSchema() {
    // 给 zod config 校验提供最小可用值（不需要真实连库）
    process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'development';
    process.env['JWT_SECRET'] =
        process.env['JWT_SECRET'] ?? 'schema-generator-dummy-secret-not-used-for-runtime-32chars';
    process.env['AES_ENCRYPTION_KEY'] = process.env['AES_ENCRYPTION_KEY'] ?? '0'.repeat(64);
    process.env['DATABASE_URL'] =
        process.env['DATABASE_URL'] ?? 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder';
    process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';

    // dynamic import 避免脚本被 import 时立刻连接 DB
    const { AppModule } = await import('../dist/app.module.js');

    const app = await NestFactory.create(AppModule, {
        logger: false,
        abortOnError: false,
        // 不开启 HTTP 监听，schema 生成不需要端口
    });

    // 触发模块初始化（GraphQL 模块在 onModuleInit 写 schema.gql）
    // 如果 Prisma 连库失败会被 catch，schema 仍可能已写盘
    try {
        await app.init();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 容忍「DB/Redis 连不上」类错误：GraphQL schema 已在更早阶段写盘
        Logger.warn(`app.init() 抛错（容忍）: ${msg.slice(0, 200)}`, 'SchemaGenerator');
    }

    return app;
}

/**
 * 复制 GraphQL SDL 到 dist 目录
 * - 源文件是 NestJS GraphQL 自动生成的 `apps/server/graphql/schema.gql`
 * - 目标位置是 `apps/server/dist/schema.gql`，供 SDK / codegen 消费
 */
async function copyGraphQLSchema(): Promise<number> {
    if (!(await fileExists(GRAPHQL_SCHEMA_SOURCE))) {
        throw new Error(
            `GraphQL schema 源文件不存在: ${GRAPHQL_SCHEMA_SOURCE}\n` +
                '请确认 src/modules/graphql/graphql.module.ts 中 autoSchemaFile 配置正确',
        );
    }

    const content = await readFile(GRAPHQL_SCHEMA_SOURCE, 'utf-8');
    await mkdir(DIST_DIR, { recursive: true });
    await writeFile(DIST_SCHEMA_GQL, content, 'utf-8');
    return content.length;
}

/**
 * 生成 OpenAPI 描述 JSON
 * - 不依赖 @nestjs/swagger（避免侵入式改动业务 controller）
 * - 手动维护一份精简版 OpenAPI 3.0 文档，覆盖现有 REST 端点
 * - 字段含义与 NestJS 实际行为一致（路径、HTTP 方法、响应包装 {code,message,data}）
 *
 * 维护建议：
 *   新增 REST 端点时同步更新此处的 paths；CI 阶段会作为 artifact 受 git 跟踪
 */
function buildOpenApiArtifact(): object {
    return {
        openapi: '3.0.3',
        info: {
            title: 'MonoKit Server REST API',
            version: '1.0.0',
            description:
                'MonoKit 后端 REST 端点（除 GraphQL 之外的部分）。所有响应统一包装为 { code, message, data }。',
        },
        servers: [
            { url: 'http://localhost:3000', description: '本地开发' },
            { url: 'https://api.example.com', description: '生产环境（替换为实际域名）' },
        ],
        components: {
            securitySchemes: {
                csrf: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-csrf-token',
                    description: 'CSRF Token 来自 GET /api/auth/csrf-token 下发的 cookie 对应值',
                },
                cookie: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'accessToken',
                    description: 'JWT access token（httpOnly cookie）',
                },
            },
            schemas: {
                CommonResponse: {
                    type: 'object',
                    properties: {
                        code: { type: 'integer', description: '业务状态码：0=成功，非 0=失败' },
                        message: { type: 'string', description: '人类可读消息' },
                        data: { description: '业务数据（任意类型）' },
                    },
                    required: ['code', 'message', 'data'],
                },
                HealthResponse: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['ok', 'error'] },
                        database: {
                            type: 'object',
                            properties: { status: { type: 'string', enum: ['up', 'down'] } },
                        },
                    },
                },
            },
        },
        paths: {
            '/health': {
                get: {
                    summary: '综合健康检查',
                    description: '数据库 + 内存 + 磁盘综合检查（@Public，无须鉴权）',
                    tags: ['health'],
                    responses: {
                        '200': {
                            description: 'OK',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/HealthResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/health/liveness': {
                get: {
                    summary: 'K8s liveness 探针',
                    description: '进程存活检查（轻量，不查依赖）',
                    tags: ['health'],
                    responses: {
                        '200': {
                            description: 'OK',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: { status: { type: 'string', example: 'ok' } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/health/readiness': {
                get: {
                    summary: 'K8s readiness 探针',
                    description: '数据库是否可连接',
                    tags: ['health'],
                    responses: {
                        '200': { description: '数据库可达' },
                        '503': { description: '数据库不可达' },
                    },
                },
            },
            '/api/auth/refresh': {
                post: {
                    summary: '刷新 access token',
                    description: '从 cookie 中的 refreshToken 换新的 access/refresh pair',
                    tags: ['auth'],
                    security: [{ cookie: [] }],
                    responses: {
                        '200': {
                            description: '刷新成功',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CommonResponse' },
                                },
                            },
                        },
                        '401': { description: '缺少 refreshToken cookie' },
                    },
                },
            },
            '/api/auth/logout': {
                post: {
                    summary: '登出',
                    description: '清除服务端 session 与客户端 cookie',
                    tags: ['auth'],
                    security: [{ cookie: [] }],
                    responses: {
                        '200': {
                            description: '登出成功',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CommonResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/api/auth/csrf-token': {
                get: {
                    summary: '获取 CSRF token',
                    description: '首次调用下发 csrf-token cookie + 返回 token；后续重复调用复用同一 token',
                    tags: ['auth'],
                    responses: {
                        '200': {
                            description: 'OK',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: { token: { type: 'string' } },
                                        required: ['token'],
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/admin/me': {
                get: {
                    summary: '获取当前管理员的权限数据',
                    description: '从缓存读取角色 / 权限码 / 菜单树，miss 时自动重建',
                    tags: ['admin'],
                    security: [{ cookie: [] }, { csrf: [] }],
                    responses: {
                        '200': {
                            description: 'OK',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CommonResponse' },
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

/**
 * 写入 OpenAPI 描述 JSON 到 dist 目录
 */
async function writeOpenApiArtifact(): Promise<void> {
    const spec = buildOpenApiArtifact();
    await mkdir(DIST_DIR, { recursive: true });
    await writeFile(DIST_OPENAPI_JSON, JSON.stringify(spec, null, 2) + '\n', 'utf-8');
}

/**
 * 主入口
 * - bootstrap AppModule 触发 GraphQL schema 自动写盘
 * - 复制 schema 到 dist
 * - 写 OpenAPI 描述到 dist
 * - 关闭应用
 */
async function main() {
    const log = new Logger('SchemaGenerator');
    log.log('▶ 开始生成 schema artifact');

    // 1. 启动 NestJS 应用触发 GraphQL schema 自动生成
    let app: Awaited<ReturnType<typeof bootstrapAppForSchema>> | null = null;
    try {
        app = await bootstrapAppForSchema();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`Bootstrap 失败（继续）: ${msg.slice(0, 200)}`);
    }

    try {
        // 2. 复制 GraphQL schema 到 dist
        const size = await copyGraphQLSchema();
        log.log(`✓ dist/schema.gql 写入完成（${size} 字节）`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`✗ GraphQL schema 复制失败: ${msg}`);
        process.exitCode = 1;
    }

    try {
        // 3. 写 OpenAPI 描述
        await writeOpenApiArtifact();
        log.log(`✓ dist/openapi.json 写入完成`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`✗ OpenAPI 写入失败: ${msg}`);
        process.exitCode = 1;
    } finally {
        // 4. 关闭 app
        if (app) {
            try {
                await app.close();
            } catch {
                /* 关闭时的错误忽略 */
            }
        }
    }

    if (process.exitCode && process.exitCode !== 0) {
        log.error('生成失败，请查看上方错误');
    } else {
        log.log('✓ schema artifact 生成完成');
    }
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
