import { vi, describe, expect, it } from 'vitest';
import { buildDataLoaders, ROOT_MENU_KEY } from './dataloader.factory.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** 构造 PrismaService 桩（只暴露 client.adminMenu / client.adminAccountRole） */
function createPrismaStub(opts: {
  menus: Array<{
    id: string;
    parentId: string | null;
    sort: number;
    createdAt: Date;
  }>;
  roleLinks?: Array<{
    accountId: string;
    role: { code: string; enabled: boolean };
  }>;
}): PrismaService {
  return {
    client: {
      adminMenu: {
        // 模拟 orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }]
        findMany: vi
          .fn<any>()
          .mockResolvedValue(
            [...opts.menus].sort(
              (a, b) =>
                a.sort - b.sort ||
                a.createdAt.getTime() - b.createdAt.getTime(),
            ),
          ),
      },
      adminAccountRole: {
        findMany: vi.fn<any>().mockResolvedValue(opts.roleLinks ?? []),
      },
    },
  } as unknown as PrismaService;
}

describe('buildDataLoaders', () => {
  it('menuChildrenByParentId：按 parentId 分组返回子菜单，ROOT_MENU_KEY 表示根菜单', async () => {
    const menus: Array<{
      id: string;
      parentId: string | null;
      sort: number;
      createdAt: Date;
    }> = [
      {
        id: 'root1',
        parentId: null,
        sort: 1,
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'child1',
        parentId: 'root1',
        sort: 2,
        createdAt: new Date('2026-01-02'),
      },
      {
        id: 'child2',
        parentId: 'root1',
        sort: 1,
        createdAt: new Date('2026-01-03'),
      },
    ];
    const prisma = createPrismaStub({ menus });
    const loaders = buildDataLoaders(prisma);

    const rootChildren =
      await loaders.menuChildrenByParentId.load(ROOT_MENU_KEY);
    expect(rootChildren).toHaveLength(1);
    expect((rootChildren[0] as { id: string }).id).toBe('root1');

    const children = await loaders.menuChildrenByParentId.load('root1');
    expect(children).toHaveLength(2);
    expect((children[0] as { id: string }).id).toBe('child2'); // 按 sort asc
    expect((children[1] as { id: string }).id).toBe('child1');
  });

  it('menuChildrenByParentId：同一请求内相同 key 命中缓存（只查一次 DB）', async () => {
    const prisma = createPrismaStub({ menus: [], roleLinks: [] });
    const loaders = buildDataLoaders(prisma);

    await loaders.menuChildrenByParentId.load('x');
    await loaders.menuChildrenByParentId.load('x');

    expect(prisma.client.adminMenu.findMany).toHaveBeenCalledTimes(1);
  });

  it('roleCodesByAccountId：批量返回账户角色码（仅 enabled，去重排序）', async () => {
    const prisma = createPrismaStub({
      menus: [],
      roleLinks: [
        { accountId: 'acc1', role: { code: 'admin', enabled: true } },
        { accountId: 'acc1', role: { code: 'operator', enabled: false } },
        { accountId: 'acc2', role: { code: 'viewer', enabled: true } },
      ],
    });
    const loaders = buildDataLoaders(prisma);

    const [roles1, roles2] = await Promise.all([
      loaders.roleCodesByAccountId.load('acc1'),
      loaders.roleCodesByAccountId.load('acc2'),
    ]);

    expect(roles1).toEqual(['admin']);
    expect(roles2).toEqual(['viewer']);
    expect(prisma.client.adminAccountRole.findMany).toHaveBeenCalledTimes(1);
  });

  it('roleCodesByAccountId：无关联账户返回空数组', async () => {
    const prisma = createPrismaStub({ menus: [], roleLinks: [] });
    const loaders = buildDataLoaders(prisma);

    const roles = await loaders.roleCodesByAccountId.load('nonexistent');
    expect(roles).toEqual([]);
  });
});
