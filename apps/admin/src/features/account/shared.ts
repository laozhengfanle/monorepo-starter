import type { AdminMenuNode } from '@starter/api-client';

/** 角色 code → 中文标签 */
export const ROLE_LABEL_MAP: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  editor: '内容编辑',
  viewer: '观察者',
  auditor: '审计员',
  operator: '运营专员',
};

/** 角色标签颜色（antd Tag color） */
export const ROLE_TAG_COLOR_MAP: Record<string, string> = {
  super_admin: 'red',
  admin: 'orange',
  editor: 'blue',
  viewer: 'default',
};

/** ISO 字符串 → YYYY-MM-DD HH:mm；非法返回 '—' */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface PermissionGroup {
  /** 模块名（目录） */
  module: string;
  /** 菜单项：name + code */
  items: { name: string; code: string }[];
}

/**
 * 我的权限分组：按 me.menus 树（directory → menu）分组。
 * 我们的 me.menus 只含 directory/menu（按钮在 permissions 数组），
 * 因此这里展示可访问的菜单权限，按钮权限单独用 permissions 平铺。
 */
export function buildPermissionGroups(menus: AdminMenuNode[]): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  for (const node of menus) {
    if (node.type === 'button') continue;
    const menuItems = (node.children ?? []).filter((c) => c.type === 'menu');
    const items = menuItems.map((m) => ({ name: m.name, code: m.code }));
    if (node.type === 'directory') {
      groups.push({ module: node.name, items });
    } else if (node.type === 'menu') {
      groups.push({ module: node.name, items: [{ name: node.name, code: node.code }] });
    }
  }
  return groups;
}
