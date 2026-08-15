import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { BizException } from '@starter/server-core';
import type { UserVo } from '@starter/contracts';
import { UserRepository } from './user.repository.js';
import { UsersService } from './users.service.js';

function makeUser(overrides: Partial<UserVo> = {}): UserVo {
  return {
    id: randomUUID(),
    username: 'alice',
    email: 'alice@example.com',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  const repository = {
    findAll: vi.fn<() => unknown>(),
    findById: vi.fn<() => unknown>(),
    create: vi.fn<() => unknown>(),
    update: vi.fn<() => unknown>(),
    delete: vi.fn<() => unknown>(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: UserRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('创建用户委托 repository 并透传', async () => {
    const user = makeUser();
    repository.create.mockResolvedValue(user);

    await expect(service.create({ username: 'alice', email: 'alice@example.com' })).resolves.toEqual(user);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('查询不存在的用户抛 BizException（USER_NOT_FOUND）', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.findById(randomUUID())).rejects.toBeInstanceOf(BizException);
    await expect(service.findById(randomUUID())).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('查询存在的用户返回 UserVo', async () => {
    const user = makeUser();
    repository.findById.mockResolvedValue(user);

    await expect(service.findById(user.id)).resolves.toEqual(user);
  });

  it('列表委托 repository 并透传分页参数', async () => {
    const page = { page: 2, pageSize: 10 };
    const paginated = { items: [], total: 0, ...page };
    repository.findAll.mockResolvedValue(paginated);

    const result = await service.list(page);

    expect(repository.findAll).toHaveBeenCalledWith(page);
    expect(result).toEqual(paginated);
  });

  it('更新不存在的用户抛 BizException', async () => {
    repository.update.mockResolvedValue(null);

    await expect(service.update(randomUUID(), { status: 'disabled' })).rejects.toBeInstanceOf(BizException);
  });

  it('删除不存在的用户抛 BizException', async () => {
    repository.delete.mockResolvedValue(null);

    await expect(service.remove(randomUUID())).rejects.toBeInstanceOf(BizException);
  });

  it('删除成功返回被删除的用户', async () => {
    const user = makeUser();
    repository.delete.mockResolvedValue(user);

    await expect(service.remove(user.id)).resolves.toEqual(user);
  });
});
