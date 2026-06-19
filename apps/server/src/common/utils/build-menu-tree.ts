/**
 * 菜单树构建纯函数
 * - 将扁平菜单列表构建为树形结构
 * - 按 sort 字段排序
 * - 只在 cache miss 时执行一次
 */

export interface FlatMenu {
    id: string;
    parentId: string | null;
    name: string;
    type: string;
    path?: string;
    routeName?: string;
    component?: string;
    icon?: string;
    permissionCode?: string;
    sort: number;
    visible: boolean;
    keepAlive: boolean;
    enabled: boolean;
    activeMenuId?: string;
}

export interface MenuNode extends FlatMenu {
    children: MenuNode[];
}

export function buildMenuTree(flatMenus: FlatMenu[]): MenuNode[] {
    const map = new Map<string, MenuNode>();
    const tree: MenuNode[] = [];

    // 先排序：sort 升序
    const sorted = [...flatMenus].sort((a, b) => a.sort - b.sort);

    for (const m of sorted) {
        map.set(m.id, { ...m, children: [] });
    }

    for (const m of sorted) {
        const node = map.get(m.id)!;
        if (m.parentId === null) {
            tree.push(node);
        } else {
            const parent = map.get(m.parentId);
            if (parent) {
                parent.children.push(node);
            }
        }
    }

    return tree;
}
