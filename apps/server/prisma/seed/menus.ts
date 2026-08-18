import { newId } from '@starter/server-core';
import type { SeedDb } from './shared.js';

type MenuSeed = {
  code: string;
  name: string;
  type: 'directory' | 'menu' | 'button';
  path?: string;
  icon?: string;
  sort: number;
  /** false = 隐藏目录/菜单（如全局权限），不进入 me() 菜单树，仅作为权限点分组 */
  visible?: boolean;
  children?: MenuSeed[];
};

/**
 * 菜单树种子（核心主数据）：目录 → 菜单 → 按钮，并绑定到 super_admin。
 * 权限点 = admin_menu 里的 menu/button 行（code 即 permissionCode）；
 * 目录（directory）无业务权限，仅用于前端菜单分组，占位编码 user-center 之类。
 */
export async function seedMenus(
  db: SeedDb,
  superAdminId: string,
): Promise<void> {
  const MENU_TREE: MenuSeed[] = [
    {
      code: 'permission-center',
      name: '权限中心',
      type: 'directory',
      icon: 'SafetyOutlined',
      sort: 10,
      children: [
        {
          code: 'account:list',
          name: '账户管理',
          type: 'menu',
          path: '/admin/accounts',
          icon: 'UserOutlined',
          sort: 1,
          children: [
            {
              code: 'account:create',
              name: '新建账户',
              type: 'button',
              sort: 1,
            },
            {
              code: 'account:update',
              name: '编辑账户',
              type: 'button',
              sort: 2,
            },
            {
              code: 'account:delete',
              name: '删除账户',
              type: 'button',
              sort: 3,
            },
          ],
        },
        {
          code: 'role:list',
          name: '角色权限',
          type: 'menu',
          path: '/admin/roles',
          icon: 'SafetyOutlined',
          sort: 2,
          children: [
            { code: 'role:create', name: '新建角色', type: 'button', sort: 1 },
            { code: 'role:update', name: '编辑角色', type: 'button', sort: 2 },
            { code: 'role:delete', name: '删除角色', type: 'button', sort: 3 },
          ],
        },
        {
          code: 'menu:list',
          name: '菜单管理',
          type: 'menu',
          path: '/admin/menus',
          icon: 'MenuOutlined',
          sort: 3,
          children: [
            { code: 'menu:create', name: '新建菜单', type: 'button', sort: 1 },
            { code: 'menu:update', name: '编辑菜单', type: 'button', sort: 2 },
            { code: 'menu:delete', name: '删除菜单', type: 'button', sort: 3 },
          ],
        },
      ],
    },
    {
      // 系统设置（对标老项目 配置中心/系统设置）：
      // 后台设置/审计日志/文件存储/缓存管理/Turnstile（短信/邮件/OAuth 明确不做）
      code: 'system-center',
      name: '系统设置',
      type: 'directory',
      icon: 'SettingOutlined',
      sort: 20,
      children: [
        {
          code: 'config:admin:view',
          name: '后台设置',
          type: 'menu',
          path: '/admin/settings',
          icon: 'SettingOutlined',
          sort: 1,
          children: [
            {
              code: 'config:admin:update',
              name: '编辑配置',
              type: 'button',
              sort: 1,
            },
          ],
        },
        {
          code: 'config:audit:view',
          name: '审计日志',
          type: 'menu',
          path: '/admin/audit-logs',
          icon: 'FileTextOutlined',
          sort: 2,
          children: [
            {
              code: 'config:audit:export',
              name: '导出日志',
              type: 'button',
              sort: 1,
            },
            {
              code: 'config:audit:clear',
              name: '清空日志',
              type: 'button',
              sort: 2,
            },
            {
              code: 'config:audit:delete',
              name: '删除日志',
              type: 'button',
              sort: 3,
            },
          ],
        },
        {
          code: 'config:file:view',
          name: '文件存储',
          type: 'menu',
          path: '/admin/storage',
          icon: 'FolderOutlined',
          sort: 3,
          children: [
            {
              code: 'config:file:delete',
              name: '删除文件',
              type: 'button',
              sort: 1,
            },
          ],
        },
        {
          code: 'config:cache:view',
          name: '缓存管理',
          type: 'menu',
          path: '/admin/cache',
          icon: 'ThunderboltOutlined',
          sort: 4,
          children: [
            {
              code: 'config:cache:delete',
              name: '清理缓存',
              type: 'button',
              sort: 1,
            },
          ],
        },
        {
          code: 'config:turnstile:view',
          name: 'Turnstile',
          type: 'menu',
          path: '/admin/turnstile',
          icon: 'SafetyCertificateOutlined',
          sort: 5,
          children: [
            {
              code: 'config:turnstile:update',
              name: '编辑配置',
              type: 'button',
              sort: 1,
            },
          ],
        },
        {
          code: 'config:dict:view',
          name: '字典管理',
          type: 'menu',
          path: '/admin/dicts',
          icon: 'BookOutlined',
          sort: 6,
          children: [
            {
              code: 'config:dict:update',
              name: '编辑字典',
              type: 'button',
              sort: 1,
            },
          ],
        },
      ],
    },
    {
      // 全局权限（对标老项目 Vue 的隐藏「全局权限」目录）：
      // visible: false → 不出现在 me() 菜单树/侧边栏，仅作为权限点分组，
      // 在角色权限分配/特例授权时可见。软删除三权限是独立维度：
      //   view = 列表显示「显示已删除」，restore = 恢复，hard_delete = 彻底删除
      code: 'global-center',
      name: '全局权限',
      type: 'directory',
      icon: 'GlobalOutlined',
      sort: 30,
      visible: false,
      children: [
        {
          code: 'global:trash:view',
          name: '查看软删除',
          type: 'button',
          sort: 10,
        },
        {
          code: 'global:trash:restore',
          name: '恢复已删数据',
          type: 'button',
          sort: 11,
        },
        {
          code: 'global:trash:hard_delete',
          name: '彻底删除数据',
          type: 'button',
          sort: 12,
        },
      ],
    },
  ];

  /** 递归 upsert 菜单树并绑定角色（幂等：按 code 对齐 name/type/path/icon/sort/parentId） */
  async function upsertMenuTree(
    client: SeedDb,
    roleId: string,
    nodes: MenuSeed[],
    parentId: string | null,
  ): Promise<number> {
    let count = 0;
    for (const node of nodes) {
      const menu = await client.adminMenu.upsert({
        where: { code: node.code },
        update: {
          name: node.name,
          type: node.type,
          path: node.path ?? null,
          icon: node.icon ?? null,
          sort: node.sort,
          visible: node.visible ?? true,
          parentId,
        },
        create: {
          id: newId(),
          code: node.code,
          name: node.name,
          type: node.type,
          path: node.path ?? null,
          icon: node.icon ?? null,
          sort: node.sort,
          visible: node.visible ?? true,
          parentId,
        },
      });
      const bound = await client.adminRoleMenu.findUnique({
        where: { roleId_menuId: { roleId, menuId: menu.id } },
      });
      if (!bound) {
        await client.adminRoleMenu.create({
          data: { id: newId(), roleId, menuId: menu.id },
        });
      }
      count += 1;
      if (node.children?.length) {
        count += await upsertMenuTree(client, roleId, node.children, menu.id);
      }
    }
    return count;
  }

  const boundCount = await upsertMenuTree(db, superAdminId, MENU_TREE, null);
  console.log(
    `✅ 已对齐菜单树并绑定 super_admin 的 ${boundCount} 个菜单/权限点`,
  );
}
