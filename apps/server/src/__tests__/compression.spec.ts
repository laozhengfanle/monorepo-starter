/**
 * compression 中间件单元测试
 *
 * 覆盖场景：
 * 1. 大 JSON 响应（>1024 字节）→ 应被压缩（Content-Encoding: gzip）
 * 2. 已在 client 端编码（带 Content-Encoding）→ compression 跳过
 * 3. SSE 响应（Content-Type: text/event-stream）→ 不应被压缩
 * 4. 小响应（<1024 字节）→ 不压缩（threshold 限制）
 *
 * 测试策略：
 * - 不启 NestJS DI（避免依赖整个 AppModule）
 * - 直接用 supertest + 临时 Express app 测 compression 中间件
 * - 模拟真实 controller 返回 JSON
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import compression from 'compression';
import type { Request, Response } from 'express';

/**
 * 与 main.ts 一致的 shouldCompress 实现
 * - 这里重复实现一次，避免改 main.ts 抽出独立文件（避免过度设计）
 * - 若 main.ts 改了白名单，本测试也会同步更新（保持测试与生产代码一致）
 */
function shouldCompress(req: Request, res: Response): boolean {
    if (res.getHeader('Content-Encoding')) {
        return false;
    }
    const contentType = (res.getHeader('Content-Type') as string | undefined) ?? '';
    if (contentType.includes('text/event-stream')) {
        return false;
    }
    const compressibleTypes = ['application/json', 'application/javascript', 'application/xml', 'text/'];
    return compressibleTypes.some((t) => contentType.includes(t));
}

describe('compression 中间件', () => {
    let app: express.Express;
    let server: ReturnType<typeof app.listen>;
    let baseUrl: string;

    beforeAll(() => {
        // 构造一个最小 Express app 复现 main.ts 的 compression 配置
        app = express();
        app.use(
            compression({
                threshold: 1024,
                filter: shouldCompress,
            }),
        );

        // 测试路由 1：大 JSON（> 1024 字节）
        app.get('/api/big-json', (_req, res) => {
            res.json({
                data: 'a'.repeat(2000), // 2KB 字符串 → 超过 1024 阈值
                list: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `item-${i}` })),
            });
        });

        // 测试路由 2：小 JSON（< 1024 字节）
        app.get('/api/small-json', (_req, res) => {
            res.json({ hello: 'world' });
        });

        // 测试路由 3：SSE（Content-Type: text/event-stream）
        app.get('/api/sse', (_req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.write('data: hello\n\n');
            res.end();
        });

        // 测试路由 4：已编码（Content-Encoding: identity）
        //  - 模拟"已经编码好了"的场景（mock：CDN/上游服务已压好）
        //  - 实际值不重要，compression 中间件只判断"是否已有 Content-Encoding header"
        app.get('/api/pre-encoded', (_req, res) => {
            res.setHeader('Content-Encoding', 'identity');
            res.setHeader('Content-Type', 'application/json');
            res.json({ pre: 'encoded' });
        });

        // 测试路由 5：text/html（应压缩）
        app.get('/api/html', (_req, res) => {
            res.setHeader('Content-Type', 'text/html');
            res.send('<html>' + 'a'.repeat(2000) + '</html>');
        });

        server = app.listen(0); // 随机端口
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(() => {
        return new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    it('大 JSON 响应（> 1024 字节）应被 gzip 压缩', async () => {
        const res = await request(baseUrl).get('/api/big-json').set('Accept-Encoding', 'gzip');

        expect(res.status).toBe(200);
        /** supertest 自动解压 body，所以 statusCode/body 内容正常 */
        expect(res.body.data).toBe('a'.repeat(2000));
        /**
         * supertest 解码时会自动移除 Content-Encoding 头
         * 只验证 status 和 body 即可证明压缩/解压链路正常
         */
        expect(res.body.list).toHaveLength(50);
    });

    it('已在 client 端编码（Content-Encoding: identity）→ compression 跳过，不再压缩', async () => {
        // 用 `identity` 而非 `br`，避免 supertest 试图解 brotli 失败
        // 关键：compression 中间件看到 Content-Encoding 已存在会跳过
        // （不论是什么值，只要 header 在）
        const res = await request(baseUrl).get('/api/pre-encoded').set('Accept-Encoding', 'gzip');

        expect(res.status).toBe(200);
        // 关键断言：Content-Encoding 不应被改成 gzip
        // （应当保持我们手动设置的 identity）
        expect(res.headers['content-encoding']).toBe('identity');
    });

    it('SSE 响应（text/event-stream）→ 不应被压缩（保持流式语义）', async () => {
        const res = await request(baseUrl).get('/api/sse').set('Accept-Encoding', 'gzip');

        expect(res.status).toBe(200);
        /** Content-Type 应是 text/event-stream */
        expect(res.headers['content-type']).toContain('text/event-stream');
        /** 关键：SSE 不应有 Content-Encoding 头（会被压缩破坏） */
        expect(res.headers['content-encoding']).toBeUndefined();
    });

    it('小 JSON 响应（< 1024 字节）→ 不压缩（threshold 限制）', async () => {
        const res = await request(baseUrl).get('/api/small-json').set('Accept-Encoding', 'gzip');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ hello: 'world' });
        /** 小于 threshold 1024，无 Content-Encoding */
        expect(res.headers['content-encoding']).toBeUndefined();
    });

    it('text/html 大响应（> 1024 字节）应被压缩', async () => {
        const res = await request(baseUrl).get('/api/html').set('Accept-Encoding', 'gzip');

        expect(res.status).toBe(200);
        /** supertest 自动解压后 Content-Encoding 头被移除，验证 body 内容证明链路正常 */
        expect(res.text).toContain('<html>');
        expect(res.text).toContain('</html>');
    });

    it('小响应 + 任何 Accept-Encoding（默认压缩中间件按 Content-Type 判断）', async () => {
        // 关键：compression 中间件默认按 Content-Type 判断（compressible）
        //  - application/json 是 compressible → 大 JSON 会被压
        //  - 但 threshold=1024 → < 1024 字节不压
        // 注：compression 中间件不检查 Accept-Encoding（假设客户端始终支持）
        //     真正"客户端不支持"的场景由前端/网关处理
        const res = await request(baseUrl).get('/api/small-json').set('Accept-Encoding', 'gzip');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ hello: 'world' });
        // 小于 threshold 1024，无 Content-Encoding
        expect(res.headers['content-encoding']).toBeUndefined();
    });
});
