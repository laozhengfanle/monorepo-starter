/**
 * MenuDataLoader — 按 parentId 批量查子菜单
 *
 * 背景：构建菜单树时，传统实现是「查根菜单 → 遍历每条查子菜单」导致 N+1
 * 优化：DataLoader 把同一帧内的 parentId 合并成单条 SQL IN 查询
 *
 * 用法：
 * ```ts
 * // resolver / service 中：
 * const children = await context.dataloaders.menuByParentId.load(parentId);
 * // children 内部已按 sort 排序（与 menu.service.findAll 一致）
 * ```
 *
 * 设计要点：
 * - 缓存键：parentId（null = 根菜单，'null' 字符串作为缓存键避免 NaN）
 * - 缓存：同一请求内多次 load 同一 parentId 命中缓存
 * - 批量窗口：默认 1 个 microtask（DataLoader 标准），与单次 GraphQL resolver 配合良好
 */
import DataLoader from 'dataloader';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AdminMenuModel } from '../../../prisma/generated/models/AdminMenu.js';
import type * as Prisma from '../../../prisma/generated/internal/prismaNamespace.js';

/** 缓存键类型：null（根菜单）单独作为 key 之一 */
export type MenuParentKey = string | null;

/** 内部 DataLoader 缓存键（DataLoader 不允许 null/primitive-undefined 作为 key，用哨兵字符串代替） */
type LoaderKey = string;

/** null parentId 在 DataLoader 内部的哨兵字符串 */
const NULL_PARENT_SENTINEL: LoaderKey = '__NULL_PARENT__';

/** 把外部 key 转成 DataLoader 可接受的 key */
function toLoaderKey(k: MenuParentKey): LoaderKey {
    return k === null ? NULL_PARENT_SENTINEL : k;
}

/** 构造 loader
 *
 * 注意：DataLoader 2.x 内部用 Map 做缓存，要求 key 必须是合法 Map key（不能是 null/undefined）
 * 所以内部用哨兵字符串 '__NULL_PARENT__' 代替 null parentId
 * 外部接口 load(null) 在外层转换
 *
 * 返回类型用 Prisma 生成的 AdminMenuModel（single source of truth）：
 * - 与 DB 行 shape 完全一致，含 activeMenuId / createdBy / updatedBy 等所有字段
 * - service 层 toAdminMenu() 会再做一次 Prisma → GraphQL 字段转换（optional 化）
 */
export function createMenuDataLoader(prisma: PrismaService): DataLoader<LoaderKey, AdminMenuModel[]> {
    return new DataLoader<LoaderKey, AdminMenuModel[]>(async (loaderKeys) => {
        // 把 loader key 转回成 parentId（用于 DB 查询）
        const hasNull = loaderKeys.some((k) => k === NULL_PARENT_SENTINEL);
        const nonNullIds = loaderKeys.filter((k): k is string => k !== NULL_PARENT_SENTINEL);

        // 构造 OR 条件：所有非 null parentId + 可选的 null parentId
        const whereOr: Prisma.AdminMenuWhereInput[] = [];
        if (nonNullIds.length > 0) {
            whereOr.push({ parentId: { in: nonNullIds } });
        }
        if (hasNull) {
            whereOr.push({ parentId: null });
        }

        // 没有 key 时直接返回空数组（防御性）
        if (whereOr.length === 0) {
            return loaderKeys.map(() => []);
        }

        const rows = await prisma.client.adminMenu.findMany({
            where: {
                OR: whereOr,
            },
            orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        });

        // 按 parentId 分组
        const grouped = new Map<string, AdminMenuModel[]>();
        const nulls: AdminMenuModel[] = [];
        for (const r of rows) {
            if (r.parentId === null) {
                nulls.push(r);
            } else {
                const list = grouped.get(r.parentId) ?? [];
                list.push(r);
                grouped.set(r.parentId, list);
            }
        }

        return loaderKeys.map((k) => {
            if (k === NULL_PARENT_SENTINEL) return nulls;
            return grouped.get(k) ?? [];
        });
    });
}

/**
 * MenuDataLoader 包装类
 * - 包一层 class 方便 NestJS 注入 + 测试
 * - 内部用 DataLoader 实例实现 batching + caching
 * - 对外暴露 load(null) → 内部转成哨兵字符串（DataLoader 不允许 null key）
 */
export class MenuDataLoader {
    private readonly loader: DataLoader<LoaderKey, AdminMenuModel[]>;

    constructor(prisma: PrismaService) {
        this.loader = createMenuDataLoader(prisma);
    }

    /**
     * 加载 parentId 的所有子菜单
     * - 第一次 load → 触发批量查
     * - 同一请求内再次 load 同一 parentId → 命中缓存
     * - parentId === null → 查根菜单（parentId IS NULL）
     */
    load(parentId: MenuParentKey): Promise<AdminMenuModel[]> {
        return this.loader.load(toLoaderKey(parentId));
    }

    /**
     * 测试 / 调试用：清空缓存（一般不调）
     */
    clear(parentId: MenuParentKey): void {
        this.loader.clear(toLoaderKey(parentId));
    }
}
