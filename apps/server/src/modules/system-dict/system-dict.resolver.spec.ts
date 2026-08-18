import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { SysDictResolver } from './system-dict.resolver.js';
import { SysDictService } from './system-dict.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';

const user = { accountId: 'op-1', userType: 'admin' };

describe('SysDictResolver', () => {
  let resolver: SysDictResolver;
  let service: {
    listTypes: ReturnType<typeof vi.fn<any>>;
    createType: ReturnType<typeof vi.fn<any>>;
    updateType: ReturnType<typeof vi.fn<any>>;
    removeType: ReturnType<typeof vi.fn<any>>;
    createItem: ReturnType<typeof vi.fn<any>>;
    updateItem: ReturnType<typeof vi.fn<any>>;
    removeItem: ReturnType<typeof vi.fn<any>>;
  };

  beforeEach(async () => {
    service = {
      listTypes: vi.fn<any>().mockResolvedValue([]),
      createType: vi.fn<any>().mockResolvedValue({ id: 't1' }),
      updateType: vi.fn<any>().mockResolvedValue({ id: 't1' }),
      removeType: vi.fn<any>().mockResolvedValue({ success: true }),
      createItem: vi.fn<any>().mockResolvedValue({ id: 'i1' }),
      updateItem: vi.fn<any>().mockResolvedValue({ id: 'i1' }),
      removeItem: vi.fn<any>().mockResolvedValue({ success: true }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SysDictResolver,
        { provide: SysDictService, useValue: service },
      ],
    })
      // 类级 @UseGuards(JwtAuthGuard, PermissionGuard) 会让 Nest 实例化守卫；
      // overrideGuard 提供 mock（守卫逻辑由各自 spec 覆盖）
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: vi.fn<any>(() => true) })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: vi.fn<any>(() => true) })
      .compile();
    resolver = moduleRef.get(SysDictResolver);
  });

  it('sysDictTypes：委托 listTypes', async () => {
    service.listTypes.mockResolvedValue([{ id: 't1', code: 'x' }]);

    expect(await resolver.sysDictTypes()).toEqual([{ id: 't1', code: 'x' }]);
  });

  it('createDictType：透传 input + 操作者 accountId', async () => {
    await resolver.createDictType({ code: 'x', name: 'X' } as never, user);

    expect(service.createType).toHaveBeenCalledWith(
      { code: 'x', name: 'X' },
      'op-1',
    );
  });

  it('deleteDictType：委托 removeType 并返回 true', async () => {
    expect(await resolver.deleteDictType('t1', user)).toBe(true);
    expect(service.removeType).toHaveBeenCalledWith('t1', 'op-1');
  });

  it('createDictItem：透传 input + 操作者 accountId', async () => {
    await resolver.createDictItem(
      { dictTypeId: 't1', label: 'L', value: 'v' } as never,
      user,
    );

    expect(service.createItem).toHaveBeenCalledWith(
      { dictTypeId: 't1', label: 'L', value: 'v' },
      'op-1',
    );
  });

  it('deleteDictItem：委托 removeItem 并返回 true', async () => {
    expect(await resolver.deleteDictItem('i1', user)).toBe(true);
    expect(service.removeItem).toHaveBeenCalledWith('i1', 'op-1');
  });
});
