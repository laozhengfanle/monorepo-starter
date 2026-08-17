import { describe, expect, it } from 'vitest';
import { buildMenuTree, type MenuRow } from './menu-tree.util.js';

function row(overrides: Partial<MenuRow> & { id: string }): MenuRow {
  return {
    parentId: null,
    name: overrides.id,
    code: overrides.id,
    type: 'menu',
    path: null,
    icon: null,
    sort: 0,
    enabled: true,
    visible: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('buildMenuTree', () => {
  const rows: MenuRow[] = [
    row({ id: 'dash', name: '仪表盘', code: 'dashboard', sort: 1 }),
    row({
      id: 'sys',
      name: '系统管理',
      code: 'system',
      type: 'directory',
      sort: 2,
    }),
    row({
      id: 'roles',
      parentId: 'sys',
      name: '角色管理',
      code: 'role:list',
      sort: 1,
    }),
    row({
      id: 'menus',
      parentId: 'sys',
      name: '菜单管理',
      code: 'menu:list',
      sort: 2,
    }),
    row({
      id: 'hidden',
      parentId: 'sys',
      name: '隐藏项',
      code: 'secret:list',
      visible: false,
      sort: 3,
    }),
  ];

  it('accessibleCodes=null 时返回完整树（超管场景）', () => {
    const tree = buildMenuTree(rows, null);

    expect(tree.map((n) => n.code)).toEqual(['dashboard', 'system']);
    const sys = tree[1];
    expect(sys.children.map((c) => c.code)).toEqual([
      'role:list',
      'menu:list',
      'secret:list',
    ]);
  });

  it('按权限码过滤：只保留可访问节点及其祖先链', () => {
    const tree = buildMenuTree(rows, new Set(['role:list']));

    // system 目录因有可见子节点随链保留，dashboard/菜单管理/隐藏项被剪掉
    expect(tree.map((n) => n.code)).toEqual(['system']);
    const sys = tree[0];
    expect(sys.children.map((c) => c.code)).toEqual(['role:list']);
  });

  it('子节点按 sort 升序排序，sort 相同按 code 字典序', () => {
    const mixed = [
      row({ id: 'b', code: 'b', sort: 2 }),
      row({ id: 'a', code: 'a', sort: 1 }),
      row({ id: 'c1', code: 'c1', sort: 1 }),
    ];
    const tree = buildMenuTree(mixed, null);

    expect(tree.map((n) => n.code)).toEqual(['a', 'c1', 'b']);
  });

  it('权限码命中子节点时保留完整祖先链', () => {
    const deep = [
      row({ id: 'l1', code: 'level1', type: 'directory' }),
      row({ id: 'l2', parentId: 'l1', code: 'level2', type: 'directory' }),
      row({ id: 'leaf', parentId: 'l2', code: 'leaf:view' }),
    ];
    const tree = buildMenuTree(deep, new Set(['leaf:view']));

    expect(tree).toHaveLength(1);
    expect(tree[0].code).toBe('level1');
    expect(tree[0].children[0].code).toBe('level2');
    expect(tree[0].children[0].children[0].code).toBe('leaf:view');
  });

  it('空输入返回空树', () => {
    expect(buildMenuTree([], new Set(['x']))).toEqual([]);
    expect(buildMenuTree([], null)).toEqual([]);
  });
});
