import DataLoader from 'dataloader';
import type { PrismaService } from '../prisma/prisma.service.js';

/** 注入到 GraphQL context 的 dataloaders 容器（按需扩展） */
export interface DataLoaders {
  /** 按 parentId 批量查子菜单（null = 根菜单） */
  menuChildrenByParentId: DataLoader<string | null, unknown[]>;
  /** 按 accountId 批量查角色码 */
  roleCodesByAccountId: DataLoader<string, string[]>;
}

/** 缓存键：null（根菜单）用哨兵字符串代替（DataLoader 不允许 null 作 key） */
const NULL_PARENT_SENTINEL = '__NULL_PARENT__';

/**
 * 根菜单缓存键：调用方用 load(ROOT_MENU_KEY) 查根菜单。
 * （DataLoader 不允许 null/undefined 作 key，统一用哨兵字符串）
 */
export const ROOT_MENU_KEY = NULL_PARENT_SENTINEL;

/**
 * 通用 DataLoader 工厂：为单次 GraphQL 请求构建一组新的 DataLoader 实例
 * - 每个请求独立 → 避免 loader 跨请求缓存污染
 * - 业务层在 resolver/service 中通过 context.dataloaders.<name>.load(key) 使用
 *
 * 背景：构建菜单树 / 查账户角色时，传统实现是循环逐个查 → N+1 SQL；
 * DataLoader 把同一帧内的 key 合并成单条 IN 查询。
 */
export function buildDataLoaders(prisma: PrismaService): DataLoaders {
  return {
    /** 按 parentId 批量查子菜单；load(ROOT_MENU_KEY) 表示根菜单 */
    menuChildrenByParentId: new DataLoader<string | null, unknown[]>(
      async (parentIds) => {
        const menus = await prisma.client.adminMenu.findMany({
          orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        });
        // 单次查询全量菜单后在内存分组（菜单表通常 < 数百条，比 N 次 IN 查询更省）
        return parentIds.map((pid) =>
          menus.filter((m) =>
            pid === ROOT_MENU_KEY || pid === null
              ? m.parentId === null
              : m.parentId === pid,
          ),
        );
      },
      { cacheKeyFn: (k) => (k === null ? NULL_PARENT_SENTINEL : k) },
    ),

    /** 按 accountId 批量查角色码 */
    roleCodesByAccountId: new DataLoader<string, string[]>(
      async (accountIds) => {
        const ids = [...accountIds];
        if (ids.length === 0) return [];
        const links = await prisma.client.adminAccountRole.findMany({
          where: { accountId: { in: ids } },
          select: {
            accountId: true,
            role: { select: { code: true, enabled: true } },
          },
        });
        return ids.map((accountId) =>
          links
            .filter((l) => l.accountId === accountId && l.role.enabled)
            .map((l) => l.role.code)
            .sort(),
        );
      },
    ),
  };
}
