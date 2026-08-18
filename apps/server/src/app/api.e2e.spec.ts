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
    /** P1-7：登录响应下发的 access token cookie（httpOnly 断言用） */
    let loginSetCookie: string[] | undefined;

    beforeAll(async () => {
      app = await createApp();
      // 登录拿 token（seed 的 root 账户）
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'root', password: 'Root!123' });
      authToken = login.body.accessToken as string;
      // superagent 的 headers['set-cookie'] 类型为 string，实际是多值数组，先经 unknown 收窄
      loginSetCookie = login.headers['set-cookie'] as unknown as
        string[] | undefined;
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

    it('P1-7：登录响应下发 httpOnly + SameSite=Strict 的 access token cookie', async () => {
      const cookie = loginSetCookie?.find((c) =>
        c.startsWith('admin_access_token='),
      );
      expect(cookie).toBeTruthy();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      // cookie 值与响应 body 的 access token 一致（jwt-auth.guard cookie 回退路径）
      const cookieToken = cookie!.split(';')[0]!.split('=')[1]!;
      expect(cookieToken).toBe(authToken);
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

    // ===== S1 修复回归：登出/改密后旧 refresh 必须 401 =====
    it('S1：login → logout → 旧 refresh 调 /auth/refresh 必须 401', async () => {
      // 1. 登录拿双 token
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'root', password: 'Root!123' });
      expect(login.status).toBe(201);
      const { refreshToken } = login.body as { refreshToken: string };

      // 2. 登出（撤销所有 token：tokenVersion++ + 写 '*' 撤销行）
      const logout = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(logout.status).toBe(201);

      // 3. 旧 refresh 调 /auth/refresh 必须 401（S1 修复前会通过 + 签发新 token）
      const staleRefresh = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(staleRefresh.status).toBe(401);
    });

    it('S1：login → changePassword → 旧 refresh 调 /auth/refresh 必须 401', async () => {
      // 1. 登录拿双 token
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'root', password: 'Root!123' });
      expect(login.status).toBe(201);
      const { refreshToken, accessToken } = login.body as {
        refreshToken: string;
        accessToken: string;
      };

      // 2. 改密（成功后撤销所有 token）
      const changePw = await request(app.getHttpServer())
        .post('/auth/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'Root!123', newPassword: 'Root!1234' });
      expect(changePw.status).toBe(201);

      // 3. 旧 refresh 必须 401
      const staleRefresh = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(staleRefresh.status).toBe(401);

      // 4. 还原密码（避免污染其他 e2e 用例）
      const newLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'root', password: 'Root!1234' });
      const restore = await request(app.getHttpServer())
        .post('/auth/me/password')
        .set('Authorization', `Bearer ${newLogin.body.accessToken}`)
        .send({ currentPassword: 'Root!1234', newPassword: 'Root!123' });
      expect(restore.status).toBe(201);
    });

    it('S1：login → refresh → 新 refresh 仍可用（撤销/重登闭环）', async () => {
      // 1. 登录
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'root', password: 'Root!123' });
      const { refreshToken } = login.body as { refreshToken: string };

      // 2. 正常 refresh 成功
      const refresh = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(refresh.status).toBe(201);
      expect(refresh.body.accessToken).toBeTruthy();
      expect(refresh.body.refreshToken).toBeTruthy();
    });
  },
);
