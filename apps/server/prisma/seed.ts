import { loadEnvFile } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { newId } from '@starter/server-core';
import { PrismaClient } from '../src/generated/prisma-client/client.js';
import bcrypt from 'bcrypt';

for (const envFile of ['.env', 'apps/server/.env']) {
  try {
    loadEnvFile(envFile);
  } catch {
    // 忽略
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // ── 1. 演示用户（幂等补数据：只创建缺失的，重复执行安全） ──
  const DEMO_USERS = [
    { username: 'alice', email: 'alice@example.com', role: 'member' as const, status: 'active' as const },
    { username: 'bob', email: 'bob@example.com', role: 'member' as const, status: 'active' as const },
    { username: 'carol', email: 'carol@example.com', role: 'admin' as const, status: 'active' as const },
  ];
  for (const demo of DEMO_USERS) {
    // rawClient 查含软删记录（username 唯一约束包括软删行），存在则跳过
    const existing = await prisma.user.findFirst({
      where: { username: demo.username },
    });
    if (!existing) {
      await prisma.user.create({
        data: { id: newId(), ...demo },
      });
      console.log(`✅ 已创建演示用户 ${demo.username}`);
    }
  }

  // ── 2. 初始管理员（阶段 3：root / Root!123） ──
  const rootIdentity = await prisma.accountIdentity.findUnique({
    where: {
      identityType_identifier: { identityType: 'username', identifier: 'root' },
    },
  });
  if (!rootIdentity) {
    const accountId = newId();
    const superAdminRole = await prisma.adminRole.findUnique({
      where: { code: 'super_admin' },
    });
    const roleId = superAdminRole?.id ?? newId();

    await prisma.$transaction(async (tx) => {
      // 账户（身份容器）
      await tx.account.create({
        data: {
          id: accountId,
          userType: 'admin',
          enabled: true,
        },
      });
      // 登录标识（bcrypt 密码）
      await tx.accountIdentity.create({
        data: {
          id: newId(),
          accountId,
          identityType: 'username',
          identifier: 'root',
          credential: await bcrypt.hash('Root!123', 10),
          verified: true,
        },
      });
      // 档案
      await tx.adminProfile.create({
        data: { id: newId(), accountId, nickname: '超级管理员' },
      });
      // 角色（super_admin）+ 绑定
      if (!superAdminRole) {
        await tx.adminRole.create({
          data: { id: roleId, name: '超级管理员', code: 'super_admin', description: '内置超管角色' },
        });
      }
      await tx.adminAccountRole.create({
        data: { id: newId(), accountId, roleId },
      });
    });
    console.log('✅ 已创建初始管理员 root / Root!123（角色 super_admin）');
  } else {
    console.log('root 账户已存在，跳过');
  }

  // ── 3. 菜单树种子（目录 → 菜单 → 按钮）+ 绑定到 super_admin ──
  // 权限点 = admin_menu 里的 menu/button 行（code 即 permissionCode）；
  // 目录（directory）无业务权限，仅用于前端菜单分组，占位编码 user-center 之类。
  type MenuSeed = {
    code: string;
    name: string;
    type: 'directory' | 'menu' | 'button';
    path?: string;
    icon?: string;
    sort: number;
    children?: MenuSeed[];
  };

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
            { code: 'account:create', name: '新建账户', type: 'button', sort: 1 },
            { code: 'account:update', name: '编辑账户', type: 'button', sort: 2 },
            { code: 'account:delete', name: '删除账户', type: 'button', sort: 3 },
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
      // 系统设置（对标老项目 配置中心/系统设置）：后台设置占位页
      code: 'system-center',
      name: '系统设置',
      type: 'directory',
      icon: 'SettingOutlined',
      sort: 20,
      children: [
        {
          code: 'config:admin',
          name: '后台设置',
          type: 'menu',
          path: '/admin/settings',
          icon: 'SettingOutlined',
          sort: 1,
        },
        {
          code: 'recycle:list',
          name: '回收站',
          type: 'menu',
          path: '/admin/recycle',
          icon: 'DeleteOutlined',
          sort: 2,
        },
      ],
    },
  ];

  /** 递归 upsert 菜单树并绑定角色（幂等：按 code 对齐 name/type/path/icon/sort/parentId） */
  async function upsertMenuTree(
    db: PrismaClient,
    roleId: string,
    nodes: MenuSeed[],
    parentId: string | null,
  ): Promise<number> {
    let count = 0;
    for (const node of nodes) {
      const menu = await db.adminMenu.upsert({
        where: { code: node.code },
        update: {
          name: node.name,
          type: node.type,
          path: node.path ?? null,
          icon: node.icon ?? null,
          sort: node.sort,
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
          parentId,
        },
      });
      const bound = await db.adminRoleMenu.findUnique({
        where: { roleId_menuId: { roleId, menuId: menu.id } },
      });
      if (!bound) {
        await db.adminRoleMenu.create({
          data: { id: newId(), roleId, menuId: menu.id },
        });
      }
      count += 1;
      if (node.children?.length) {
        count += await upsertMenuTree(db, roleId, node.children, menu.id);
      }
    }
    return count;
  }

  const superAdminRole = await prisma.adminRole.findUnique({ where: { code: 'super_admin' } });
  if (superAdminRole) {
    const boundCount = await upsertMenuTree(prisma, superAdminRole.id, MENU_TREE, null);
    console.log(`✅ 已对齐菜单树并绑定 super_admin 的 ${boundCount} 个菜单/权限点`);
  }

  // ── 4. 演示角色 + 账号（特例授权演示）：部分权限 ──
  // 运营专员角色只拥有部分权限（account:list / account:update / role:list），
  // 配合账号 operator1 可在「特例授权」弹窗直观看到：基线权限只显示禁止、其余只显示允许
  const OPERATOR_CODES = ['account:list', 'account:update', 'role:list'];
  let operatorRole = await prisma.adminRole.findUnique({ where: { code: 'operator' } });
  if (!operatorRole) {
    operatorRole = await prisma.adminRole.create({
      data: {
        id: newId(),
        name: '运营专员',
        code: 'operator',
        description: '演示角色：拥有部分权限（账户管理/角色权限），用于特例授权演示',
      },
    });
    console.log('✅ 已创建演示角色 运营专员（operator）');
  }
  // 幂等绑定部分权限
  const operatorMenus = await prisma.adminMenu.findMany({
    where: { code: { in: OPERATOR_CODES } },
    select: { id: true },
  });
  for (const menu of operatorMenus) {
    const bound = await prisma.adminRoleMenu.findUnique({
      where: { roleId_menuId: { roleId: operatorRole.id, menuId: menu.id } },
    });
    if (!bound) {
      await prisma.adminRoleMenu.create({
        data: { id: newId(), roleId: operatorRole.id, menuId: menu.id },
      });
    }
  }
  // 演示账号 operator1（绑定运营专员角色）
  const operatorIdentity = await prisma.accountIdentity.findUnique({
    where: {
      identityType_identifier: { identityType: 'username', identifier: 'operator1' },
    },
  });
  if (!operatorIdentity) {
    const accountId = newId();
    await prisma.$transaction(async (tx) => {
      await tx.account.create({
        data: { id: accountId, userType: 'admin', enabled: true },
      });
      await tx.accountIdentity.create({
        data: {
          id: newId(),
          accountId,
          identityType: 'username',
          identifier: 'operator1',
          credential: await bcrypt.hash('Operator!123', 10),
          verified: true,
        },
      });
      await tx.adminProfile.create({
        data: { id: newId(), accountId, nickname: '运营专员' },
      });
      await tx.adminAccountRole.create({
        data: { id: newId(), accountId, roleId: operatorRole.id },
      });
    });
    console.log('✅ 已创建演示账号 operator1 / Operator!123（角色 运营专员）');
  }

  // ── 5. 清理旧菜单（老结构遗留）：用户中心 分支（user-center / user:*) ──
  // 对齐老项目：管理端无"用户中心"，菜单树里不再保留该分支及其权限点
  const LEGACY_MENU_CODES = ['user-center', 'user:list', 'user:create', 'user:update', 'user:delete'];
  const legacyMenus = await prisma.adminMenu.findMany({
    where: { code: { in: LEGACY_MENU_CODES } },
    select: { id: true },
  });
  if (legacyMenus.length > 0) {
    const legacyIds = legacyMenus.map((m) => m.id);
    await prisma.adminRoleMenu.deleteMany({ where: { menuId: { in: legacyIds } } });
    await prisma.adminMenu.deleteMany({ where: { id: { in: legacyIds } } });
    console.log(`🗑️ 已清理旧「用户中心」菜单/权限点 ${legacyMenus.length} 个`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
