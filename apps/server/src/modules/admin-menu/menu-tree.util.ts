import type { AdminMenuNode, MenuType } from '@starter/contracts';

/** admin_menu 行（Prisma 查询返回的字段子集） */
export interface MenuRow {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  type: string;
  path: string | null;
  icon: string | null;
  sort: number;
  enabled: boolean;
  createdAt: Date;
}

/**
 * 平铺菜单行 → 菜单树（按 sort 升序、code 兜底排序）。
 * @param accessibleCodes 可访问权限码集合；传 null 表示全量（超管/管理端完整树）
 * @remarks 仅保留 accessible 节点及其祖先链：目录即使未直接授权，只要有可见子节点就会随链保留
 */
export function buildMenuTree(
  rows: MenuRow[],
  accessibleCodes: Set<string> | null,
): AdminMenuNode[] {
  const byId = new Map(rows.map((r) => [r.id, r]));

  // 1. 标记保留节点（自身可访问 + 祖先链）
  const keep = new Set<string>();
  if (accessibleCodes !== null) {
    for (const row of rows) {
      if (!accessibleCodes.has(row.code)) continue;
      let cur: MenuRow | undefined = row;
      while (cur && !keep.has(cur.id)) {
        keep.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    }
  } else {
    for (const row of rows) keep.add(row.id);
  }

  // 2. 按父节点分组
  const childrenOf = new Map<string | null, MenuRow[]>();
  for (const row of rows) {
    if (!keep.has(row.id)) continue;
    const key = row.parentId ?? null;
    const list = childrenOf.get(key) ?? [];
    list.push(row);
    childrenOf.set(key, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  }

  // 3. 递归组装
  const toNode = (row: MenuRow): AdminMenuNode => ({
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    type: row.type as MenuType,
    path: row.path,
    icon: row.icon,
    sort: row.sort,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    children: (childrenOf.get(row.id) ?? []).map(toNode),
  });

  return (childrenOf.get(null) ?? []).map(toNode);
}
