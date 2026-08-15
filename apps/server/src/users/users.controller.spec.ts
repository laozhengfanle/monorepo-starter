import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard.js';
import { PermissionGuard } from '../modules/auth/permission.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;
  const service = {
    list: vi.fn<() => unknown>(),
    findById: vi.fn<() => unknown>(),
    create: vi.fn<() => unknown>(),
    update: vi.fn<() => unknown>(),
    remove: vi.fn<() => unknown>(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    })
      // 守卫依赖（JwtService/Prisma 等）不在单测范围，直接放行
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(UsersController);
  });

  it('list 委托 service 并透传分页参数', async () => {
    const query = { page: 2, pageSize: 10 };
    service.list.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });

    await controller.list(query);

    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('findOne 透传 uuid 参数', async () => {
    const id = randomUUID();
    service.findById.mockResolvedValue({ id });

    const result = await controller.findOne(id);

    expect(service.findById).toHaveBeenCalledWith(id);
    expect(result).toEqual({ id });
  });

  it('create 委托 service', async () => {
    const input = { username: 'alice', email: 'alice@example.com' };
    service.create.mockResolvedValue({ id: randomUUID(), ...input });

    await controller.create(input as never);

    expect(service.create).toHaveBeenCalledWith(input);
  });

  it('update 透传 id 与更新字段', async () => {
    const id = randomUUID();
    const input = { status: 'disabled' as const };
    service.update.mockResolvedValue({ id, ...input });

    await controller.update(id, input);

    expect(service.update).toHaveBeenCalledWith(id, input);
  });

  it('remove 透传 id', async () => {
    const id = randomUUID();
    service.remove.mockResolvedValue({ id });

    await controller.remove(id);

    expect(service.remove).toHaveBeenCalledWith(id);
  });
});
