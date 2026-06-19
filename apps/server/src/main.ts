// 1) reflect-metadata：必须在所有装饰器代码之前加载（NestJS DI 元数据生成依赖）
// 2) ConfigModule.forRoot() 内部会同步加载 .env + Zod 校验（@nestjs/config 用 dotenv 同步处理）
//    所以 PrismaService 注入 ConfigService 时 database.url 已经校验通过，无需在 main.ts 顶部加载 dotenv
import 'reflect-metadata';
import crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { Logger as NestPinoLogger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import type { Request, Response } from 'express';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { sanitizeObject } from './common/utils/secure-json.js';
import { csrfTokenHandler, csrfGuard } from './common/middleware/csrf.middleware.js';
import { buildCorsOptions } from './common/cors/cors.helper.js';

/**
 * compression filter：决定哪些响应应该被压缩
 * - 只对 application/json / text/* / application/javascript 启用
 * - 其他 MIME（图片 / 视频 / 二进制）压缩收益小，反而浪费 CPU
 * - 已经带 Content-Encoding 头的响应自动跳过（compression 中间件内部处理）
 * - SSE（text/event-stream）必须跳过：压缩会破坏流式边界，导致客户端无法解析事件
 *
 * @param req Express 请求
 * @param res Express 响应
 * @returns true=启用压缩；false=不压缩
 */
function shouldCompress(req: Request, res: Response): boolean {
    // 已在客户端编码的响应跳过（compression 也会判断，但我们多一道防线）
    if (res.getHeader('Content-Encoding')) {
        return false;
    }

    /**
     * SSE 必须跳过压缩
     * - 原因：compression 用 gzip 缓冲整个响应，破坏了 SSE 的「流式分块」语义
     * - 客户端 EventSource 会卡在第一个事件上，连接挂死
     * - 解决：检测 Content-Type: text/event-stream → 跳过
     */
    const contentType = (res.getHeader('Content-Type') as string | undefined) ?? '';
    if (contentType.includes('text/event-stream')) {
        return false;
    }

    // 用 compression 自带的 compressible 库逻辑判断（白名单 + threshold）
    // 这里我们直接用 compression 内置的 shouldCompress 也行，但显式声明更清晰
    const compressibleTypes = ['application/json', 'application/javascript', 'application/xml', 'text/'];
    return compressibleTypes.some((t) => contentType.includes(t));
}

async function bootstrap() {
    // ── 0. 启动前友好检查：fork 项目最常见的失败原因是没配 .env ──
    //     用 import('node:fs') 因为文件顶部已有 reflect-metadata / crypto 导入，
    //     fs 的 ESM 动态 import 不增加首屏阻塞
    const { existsSync } = await import('node:fs');
    const cwd = process.cwd();
    const dotEnvPath = `${cwd}/.env`;
    if (!existsSync(dotEnvPath)) {
        console.error('');
        console.error('❌ 未找到 .env 文件！');
        console.error('');
        console.error('   fork 项目后首次启动需要先创建 .env：');
        console.error(`   cp ${cwd}/.env.example ${cwd}/.env`);
        console.error('');
        console.error('   然后根据你的本地环境修改 .env 中的连接信息（主要是 DATABASE_URL）。');
        console.error('   生产环境通过 Docker -e 注入环境变量，不需要 .env 文件。');
        console.error('');
        process.exit(1);
    }
    // bodyParser: false — 禁用 NestJS 内置 parser，手动注册 express.json()
    //   以便在 JSON 解析之后、业务处理之前插入 sanitizeObject 中间件（原型链污染防护）
    // abortOnError: false — Node 24 下 process.abort() 会导致进程直接崩溃不输出错误信息
    // bufferLogs: true — 先缓存日志，等 app.useLogger() 注入 PinoLogger 后再输出
    //   （否则 bootstrap 阶段的日志会落到 NestJS 默认 ConsoleLogger，与 Pino 格式不一致）
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bufferLogs: true,
        bodyParser: false,
        abortOnError: false,
        logger: ['log', 'warn', 'error'],
    });
    // 用全局 PinoLogger 替换 NestJS 默认 ConsoleLogger
    // - 所有 app.useLogger 之后调用的 logger.log/warn/error 都会走 Pino 格式
    // - LoggerModule 必须在 AppModule 的 imports 第一位，否则 app.get(Logger) 拿不到
    const logger = app.get(NestPinoLogger);

    /**
     * ConfigService 提前取出 — 后续多个中间件（CSRF / 静态目录等）需在路由注册前使用
     * - main.ts 启动顺序：先取 configService，再注册中间件，最后 listen
     * - 这里同时是「STORAGE_LOCAL_DIR 走 zod 校验」的统一入口
     */
    const configService = app.get(ConfigService);

    // ── 1. Helmet 安全头 ──
    app.use(
        helmet({
            frameguard: { action: 'deny' },
            noSniff: true,
            hidePoweredBy: true,
            hsts:
                process.env.NODE_ENV === 'production'
                    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
                    : false,
        }),
    );

    // ── 1.2 响应压缩 ──
    // 必须在 helmet 之后、路由之前
    // threshold: 1024 字节以下不压缩（小响应 gzip 开销大于收益）
    // filter: shouldCompress 显式白名单 application/json / text/* / application/javascript
    //   跳过 SSE / 已编码响应（详见 shouldCompress 注释）
    // 默认走 gzip（Accept-Encoding 协商），客户端不支持时自动降级
    app.use(
        compression({
            threshold: 1024,
            filter: shouldCompress,
        }),
    );

    // ── 1.5 JSON Body 解析 + 原型链污染防护 ──
    // bodyParser: false 禁用了 NestJS 内置 parser，这里手动注册
    app.use(json({ limit: '1mb' }));
    // 递归清理 __proto__ / constructor / prototype 键
    // JSON.parse 本身不会触发原型污染（使用 [[DefineOwnProperty]]），
    // 危险在于后续 deep merge / Object.assign / for...in 赋值时触发 __proto__ setter。
    // 此中间件在 express.json() 解析后、业务代码前同步执行，安全效果与 reviver 等价。
    // 复用 express.json() 而非手写流式解析，是因为底层 raw-body + iconv-lite
    // 处理了编码、chunk 拼接、异常标准化等生产边界情况，更可靠。
    app.use((req, _res, next) => {
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body) as Record<string, unknown>;
        }
        next();
    });

    // ── 2. Cookie 解析 ──
    app.use(cookieParser());

    // ── 2.5 全局 /api 前缀（排除 GraphQL）──
    app.setGlobalPrefix('api', { exclude: ['graphql'] });

    // ── 2.6 静态文件托管 — 暴露 uploads 目录 ──
    // STORAGE_LOCAL_DIR 已由 storage.config.ts 用 zod 校验（默认值 './uploads'），
    // 通过 ConfigService 读取避免在 main.ts 静态访问 process.env
    const uploadsDir = resolve(configService.get<string>('storage.STORAGE_LOCAL_DIR') ?? './uploads');
    app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

    // ── 2.7 CSRF 防护（Double Submit Cookie 模式）──
    // 1) GET /api/auth/csrf-token → 下发 CSRF cookie（前端可显式预取）
    // 2) 写请求（POST/PUT/DELETE/PATCH + GraphQL mutation）需带 X-CSRF-Token header
    //    顺序：必须在 cookieParser 之后（要读 cookie），必须在路由之前
    //    登录响应也会通过 issueCsrfCookie() 一次性下发 token
    // ── CSRF 中间件工厂注入 ──
    // Express 中间件不是 Nest provider，无法用构造注入 ConfigService
    // 改用工厂模式：先取 ConfigService，再调用工厂函数返回真正的 handler
    // 注：用 app.use 而非 app.get 避免 NestJS 控制器签名的类型检查
    app.use('/api/auth/csrf-token', csrfTokenHandler(configService));
    app.use(csrfGuard(configService));

    // ── 3. CORS 白名单 ──
    // 使用 buildCorsOptions() 工厂函数：
    // - 函数式 origin callback（不能用 '*' + credentials）
    // - dev 模式未配 CORS_ORIGINS → fallback 到 ['http://localhost:5173','http://localhost:5174']
    // - prod 模式未配 CORS_ORIGINS → origin callback 返回 false（拒绝所有跨域）
    app.enableCors(buildCorsOptions(process.env));

    // ── 4. X-Request-ID ──
    app.use((req, res, next) => {
        const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
        req.headers['x-request-id'] = requestId;
        res.setHeader('X-Request-ID', requestId);
        next();
    });

    // ── 5. 全局异常过滤器 ──
    //    GlobalExceptionFilter 通过 APP_FILTER 在 AppModule 注册
    //    - 合并了原 GlobalExceptionFilter + GraphQLExceptionFilter 的双 @Catch() 冲突
    //    - REST 异常 → 返回 JSON 业务错误码，生产环境脱敏
    //    - GraphQL 异常 → 转换为带业务错误码的 GraphQLError

    // ── 6. 优雅关闭 ──
    app.enableShutdownHooks();

    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log(`🚀 Server started on port ${port} (env=${process.env.NODE_ENV ?? 'development'})`);
}

bootstrap().catch((err) => {
    // Node 24 的 util.inspect 与 NestJS ConsoleLogger 不兼容，
    // 导致 logger.error() 打印错误对象时崩溃，所以这里用 console.error 直接输出
    try {
        const msg = err?.message || String(err);
        console.error('Bootstrap failed:', msg);
        if (err?.stack) {
            const lines = err.stack.split('\n').slice(0, 10);
            console.error(lines.join('\n'));
        }
    } catch {
        console.error('Bootstrap failed with an error that cannot be displayed');
    }
    process.exit(1);
});
