import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { BizException } from '@starter/server-core';
import { InMemoryUserRepository } from './in-memory-user.repository.js';
import { UserRepository } from './user.repository.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: UserRepository, useClass: InMemoryUserRepository }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('创建用户返回带默认值的 UserVo', async () => {
    const user = await service.create({ username: 'alice', email: 'alice@example.com' });

    expect(user.id).toBeTruthy();
    expect(user.role).toBe('member');
    expect(user.status).toBe('active');
    expect(user.createdAt).toBeTruthy();
  });

  it('查询不存在的用户抛 BizException（USER_NOT_FOUND）', async () => {
    await expect(service.findById(randomUUID())).rejects.toBeInstanceOf(BizException);
    await expect(service.findById(randomUUID())).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('列表分页返回 envelope 与 meta', async () => {
    await service.create({ username: 'alice', email: 'alice@example.com' });
    await service.create({ username: 'bob', email: 'bob@example.com' });
    await service.create({ username: 'carol', email: 'carol@example.com' });

    const result = await service.list({ page: 1, pageSize: 2 });

    if (!result.success) {
      throw new Error(`期望成功响应，实际: ${JSON.stringify(result)}`);
    }
    expect(result.data.items).toHaveLength(2);
    expect(result.data.total).toBe(3);
    expect(result.meta).toEqual({ total: 3, page: 1, pageSize: 2 });
  });

  it('更新保持不可变：原记录不被修改', async () => {
    const created = await service.create({ username: 'alice', email: 'alice@example.com' });

    const updated = await service.update(created.id, { status: 'disabled' });

    expect(updated.status).toBe('disabled');
    expect(created.status).toBe('active');
  });

  it('更新不存在的用户抛 BizException', async () => {
    await expect(service.update(randomUUID(), { username: 'x' })).rejects.toBeInstanceOf(BizException);
  });

  it('删除不存在的用户抛 BizException', async () => {
    await expect(service.remove(randomUUID())).rejects.toBeInstanceOf(BizException);
  });

  it('删除成功返回被删除的用户，且之后查询抛 BizException', async () => {
    const created = await service.create({ username: 'alice', email: 'alice@example.com' });

    const removed = await service.remove(created.id);

    expect(removed.id).toBe(created.id);
    await expect(service.findById(created.id)).rejects.toBeInstanceOf(BizException);
  });
});
