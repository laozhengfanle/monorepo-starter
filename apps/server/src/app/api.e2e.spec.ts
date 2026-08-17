import type { INestApplication } from '@nestjs/common';
import { readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, emitOpenApi } from '../app-setup.js';

// e2e 需要真实数据库（createApp 会初始化 Prisma 连接）：
// - 本地无 DATABASE_URL 时整体跳过（本地无库也能跑单元测试）
// - CI 通过 services(postgres/redis) + env 注入 DATABASE_URL 时正常运行
describe.skipIf(!process.env['DATABASE_URL'])(
  'API e2e（进程内 supertest，全链路含校验管道与异常过滤器）',
  () => {
    let app: INestApplication;
    let authToken: string;

    beforeAll(async () => {
      app = await createApp();
      // 登录拿 token（seed 的 root 账户）
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'root', password: 'Root!123' });
      authToken = login.body.accessToken as string;
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /health → 200 裸数据', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        service: 'monorepo-starter-api',
      });
    });

    it('GET /health/liveness → 200 存活探针（k8s liveness 用）', async () => {
      const res = await request(app.getHttpServer()).get('/health/liveness');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /health/readiness → 200（terminus 就绪探针）', async () => {
      const res = await request(app.getHttpServer()).get('/health/readiness');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('认证：GET /auth/me 未携带 token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me');
      expect(res.status).toBe(401);
    });

    it('认证：GET /auth/me 携带 token → 返回账户信息', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('root');
      expect(res.body.roleCodes).toContain('super_admin');
    });

    it('未知路由 → 404', async () => {
      const res = await request(app.getHttpServer()).get('/no-such-route');
      expect(res.status).toBe(404);
    });

    it('Swagger JSON 可获取', async () => {
      const res = await request(app.getHttpServer()).get('/api-docs-json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBeTruthy();
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/health']),
      );
    });

    it('emitOpenApi 发射合法 OpenAPI JSON（Orval codegen 输入）', async () => {
      const out = path.join(os.tmpdir(), `openapi-${process.pid}.json`);
      try {
        await emitOpenApi(out);
        const content = JSON.parse(await readFile(out, 'utf-8'));
        expect(content.openapi).toBeTruthy();
        expect(Object.keys(content.paths)).toEqual(
          expect.arrayContaining(['/health']),
        );
      } finally {
        await unlink(out).catch(() => undefined);
      }
    });
  },
);
