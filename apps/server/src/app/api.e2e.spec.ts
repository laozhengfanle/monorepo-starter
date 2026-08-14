import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp, emitOpenApi } from '../app-setup.js';

describe('API e2e（进程内 supertest，全链路含校验管道与异常过滤器）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.getHttpAdapter().getInstance().ready();
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

  it('POST /users 非法 body → 422 + 字段级校验详情', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'ab', email: 'not-an-email' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.username).toBeDefined();
    expect(res.body.error.details.email).toBeDefined();
  });

  it('users CRUD 全流程（成功=裸数据，失败=envelope）', async () => {
    const server = app.getHttpServer();

    // create（成功响应直接为数据本身，无 envelope 包裹）
    const created = await request(server)
      .post('/users')
      .send({ username: 'alice', email: 'alice@example.com' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      username: 'alice',
      role: 'member',
      status: 'active',
    });
    const id = created.body.id as string;

    // list（分页字段直接在内层）
    const list = await request(server).get('/users?page=1&pageSize=10');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    expect(list.body.total).toBeGreaterThanOrEqual(1);

    // update
    const updated = await request(server)
      .put(`/users/${id}`)
      .send({ status: 'disabled' });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('disabled');

    // findOne
    const found = await request(server).get(`/users/${id}`);
    expect(found.status).toBe(200);
    expect(found.body.email).toBe('alice@example.com');

    // delete
    const removed = await request(server).delete(`/users/${id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.id).toBe(id);

    // 已删除 → 业务异常（失败路径统一 envelope）
    const missing = await request(server).get(`/users/${id}`);
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('GET /users/:id 非法 uuid → 400', async () => {
    const res = await request(app.getHttpServer()).get('/users/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('未知路由 → 404', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route');
    expect(res.status).toBe(404);
  });

  it('Swagger JSON 可获取', async () => {
    const res = await request(app.getHttpServer()).get('/api-docs-json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBeTruthy();
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/health', '/users']));
  });

  it('随机 uuid 查询不存在用户 → 400 USER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get(`/users/${randomUUID()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('emitOpenApi 发射合法 OpenAPI JSON（Orval codegen 输入）', async () => {
    const out = path.join(os.tmpdir(), `openapi-${process.pid}.json`);
    try {
      await emitOpenApi(out);
      const content = JSON.parse(await readFile(out, 'utf-8'));
      expect(content.openapi).toBeTruthy();
      expect(Object.keys(content.paths)).toEqual(
        expect.arrayContaining(['/health', '/users', '/users/{id}']),
      );
    } finally {
      await unlink(out).catch(() => undefined);
    }
  });
});
