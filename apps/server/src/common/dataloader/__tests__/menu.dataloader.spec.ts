/**
 * MenuDataLoader 单元测试
 *
 * 覆盖 3 个核心场景（DataLoader N+1 消除）：
 * 1. cache 命中：同一 parentId 多次 load → 只查 1 次 DB
 * 2. N+1 消除：3 个不同 parentId 在同一帧内 load → 只查 1 次 SQL（OR + IN）
 * 3. batch 合并：3 个 root 节点查询 → 1 次 SQL
 *
 * 实现方式：mock prisma.client.adminMenu.findMany，断言调用次数 ≤ 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MenuDataLoader } from '../menu.dataloader.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

/** 构造一个 prisma mock，findMany 接收 spy */
function buildPrismaMock(rows: any[]): { prisma: PrismaService; findMany: ReturnType<typeof vi.fn> } {
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = {
        client: { adminMenu: { findMany } },
    } as unknown as PrismaService;
    return { prisma, findMany };
}

describe('MenuDataLoader', () => {
    let findMany: ReturnType<typeof vi.fn>;
    let prisma: PrismaService;
    let loader: MenuDataLoader;

    beforeEach(() => {
        // 准备 2 个根节点 + 2 个子节点的测试数据
        const rows = [
            {
                id: 'root-1',
                parentId: null,
                name: '系统',
                sort: 1,
                deletedAt: null,
                path: '/sys',
                routeName: 'sys',
                component: '',
                icon: '',
                permissionCode: '',
                type: 'dir',
                visible: true,
                keepAlive: false,
                enabled: true,
                activeMenuId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: 'root-2',
                parentId: null,
                name: '业务',
                sort: 2,
                deletedAt: null,
                path: '/biz',
                routeName: 'biz',
                component: '',
                icon: '',
                permissionCode: '',
                type: 'dir',
                visible: true,
                keepAlive: false,
                enabled: true,
                activeMenuId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: 'child-1',
                parentId: 'root-1',
                name: '用户',
                sort: 1,
                deletedAt: null,
                path: '/sys/user',
                routeName: 'sys-user',
                component: '',
                icon: '',
                permissionCode: 'iam:user:list',
                type: 'menu',
                visible: true,
                keepAlive: false,
                enabled: true,
                activeMenuId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: 'child-2',
                parentId: 'root-1',
                name: '角色',
                sort: 2,
                deletedAt: null,
                path: '/sys/role',
                routeName: 'sys-role',
                component: '',
                icon: '',
                permissionCode: 'iam:role:list',
                type: 'menu',
                visible: true,
                keepAlive: false,
                enabled: true,
                activeMenuId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ];
        const mock = buildPrismaMock(rows);
        findMany = mock.findMany;
        prisma = mock.prisma;
        loader = new MenuDataLoader(prisma);
    });

    // 场景 1：cache 命中
    it('场景1：同一 parentId 多次 load → 只查 1 次 DB（DataLoader cache 命中）', async () => {
        // 同一帧内连续 load 同一 parentId
        const p1 = loader.load('root-1');
        const p2 = loader.load('root-1');
        const p3 = loader.load('root-1');
        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
        // 三次结果一致（cache 命中）
        expect(r1).toBe(r2);
        expect(r2).toBe(r3);
        expect(r1.map((c) => c.id)).toEqual(['child-1', 'child-2']);
        // DB 查询只发生 1 次
        expect(findMany).toHaveBeenCalledTimes(1);
    });

    // 场景 2：N+1 消除
    it('场景2：3 个不同 parentId 在同一帧内 load → 只查 1 次 SQL（OR + IN 合并）', async () => {
        // 同一帧内 3 个不同 parentId：root-1, root-2, child-of-root-2
        const p1 = loader.load('root-1');
        const p2 = loader.load('root-2');
        const p3 = loader.load('non-existent');
        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
        // 三个 parent 的结果都对
        expect(r1.map((c) => c.id)).toEqual(['child-1', 'child-2']);
        expect(r2).toEqual([]); // root-2 在 mock 中没有子节点
        expect(r3).toEqual([]); // 不存在的 parent 返回空数组
        // 关键断言：3 个 load 合并成 1 次 SQL
        expect(findMany).toHaveBeenCalledTimes(1);
        // 而且查询条件应该是 IN/OR
        const where = findMany.mock.calls[0][0]?.where;
        expect(where).toBeTruthy();
        expect(where.OR).toBeDefined();
    });

    // 场景 3：batch 合并（含 null parentId = 根菜单）
    it('场景3：根菜单（parentId=null）批量查 → 1 次 SQL 查所有根', async () => {
        const p1 = loader.load(null);
        const p2 = loader.load(null);
        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toBe(r2);
        expect(r1.map((c) => c.id)).toEqual(['root-1', 'root-2']);
        expect(findMany).toHaveBeenCalledTimes(1);
    });

    // 场景 4：clear() 清缓存
    it('场景4：clear() 后再次 load → 重新查 DB', async () => {
        await loader.load('root-1');
        expect(findMany).toHaveBeenCalledTimes(1);
        loader.clear('root-1');
        await loader.load('root-1');
        // clear 之后第二次 load 会触发新的 batch
        expect(findMany).toHaveBeenCalledTimes(2);
    });

    // 场景 5：OR 查询条件
    it('场景5：findMany 应使用 OR 条件合并查询', async () => {
        await loader.load('root-1');
        const where = findMany.mock.calls[0][0]?.where;
        expect(where.OR).toBeDefined();
    });
});
