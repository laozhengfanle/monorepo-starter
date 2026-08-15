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
    /** false = 隐藏目录/菜单（如全局权限），不进入 me() 菜单树，仅作为权限点分组 */
    visible?: boolean;
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
            { code: 'config:admin:update', name: '编辑配置', type: 'button', sort: 1 },
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
            { code: 'config:audit:export', name: '导出日志', type: 'button', sort: 1 },
            { code: 'config:audit:clear', name: '清空日志', type: 'button', sort: 2 },
            { code: 'config:audit:delete', name: '删除日志', type: 'button', sort: 3 },
          ],
        },
        {
          code: 'config:file:view',
          name: '文件存储',
          type: 'menu',
          path: '/admin/storage',
          icon: 'FolderOutlined',
          sort: 3,
        },
        {
          code: 'config:cache:view',
          name: '缓存管理',
          type: 'menu',
          path: '/admin/cache',
          icon: 'ThunderboltOutlined',
          sort: 4,
          children: [
            { code: 'config:cache:delete', name: '清理缓存', type: 'button', sort: 1 },
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
            { code: 'config:turnstile:update', name: '编辑配置', type: 'button', sort: 1 },
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
        { code: 'global:trash:view', name: '查看软删除', type: 'button', sort: 10 },
        { code: 'global:trash:restore', name: '恢复已删数据', type: 'button', sort: 11 },
        { code: 'global:trash:hard_delete', name: '彻底删除数据', type: 'button', sort: 12 },
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

  // ── 4.5 演示软删除数据：deleted_demo（已删除演示账号，用于展示软删除视图） ──
  const deletedDemoIdentity = await prisma.accountIdentity.findUnique({
    where: {
      identityType_identifier: { identityType: 'username', identifier: 'deleted_demo' },
    },
  });
  if (!deletedDemoIdentity) {
    const accountId = newId();
    await prisma.$transaction(async (tx) => {
      await tx.account.create({
        data: { id: accountId, userType: 'admin', enabled: true, deletedAt: new Date() },
      });
      await tx.accountIdentity.create({
        data: {
          id: newId(),
          accountId,
          identityType: 'username',
          identifier: 'deleted_demo',
          credential: await bcrypt.hash('Deleted!123', 10),
          verified: true,
        },
      });
      await tx.adminProfile.create({
        data: { id: newId(), accountId, nickname: '已删除演示账号' },
      });
      if (operatorRole) {
        await tx.adminAccountRole.create({
          data: { id: newId(), accountId, roleId: operatorRole.id },
        });
      }
    });
    console.log('✅ 已创建软删除演示账号 deleted_demo（在「显示已删除」视图可见）');
  }

  // ── 4.6 系统配置默认值（system_config，key-value JSON） ──
  // 后台设置 settings / 文件存储 storage.driver / Turnstile turnstile.config（幂等 upsert）
  const DEFAULT_CONFIGS = [
    {
      key: 'settings',
      value: {
        name: 'monorepo-starter',
        logo: '',
        footerText: '© zhengbo',
        passwordMinLength: 8,
        loginFailThreshold: 5,
        lockDuration: 30,
        passwordComplexity: 'medium',
        watermarkContent: '{{username}} {{date}}',
        keepAliveMax: 10,
        requestTimeout: 10000,
      },
    },
    {
      key: 'storage.driver',
      // 与页面读取字段一致：local 模式用 localPath（老项目 localDir/localPath 不一致的坑已统一）
      value: { driver: 'local', localPath: './uploads', baseUrl: '/uploads' },
    },
    {
      key: 'turnstile.config',
      // Cloudflare 官方测试密钥（任何 token 都通过验证）；生产替换为真实密钥
      value: {
        enabled: false,
        siteKey: '1x00000000000000000000AA',
        secretKey: '1x0000000000000000000000000000000AA',
      },
    },
  ];
  for (const cfg of DEFAULT_CONFIGS) {
    const existing = await prisma.systemConfig.findFirst({
      where: { key: cfg.key, deletedAt: null },
    });
    if (!existing) {
      await prisma.systemConfig.create({
        data: {
          id: newId(),
          key: cfg.key,
          value: cfg.value as never,
          remark: null,
          updatedBy: null,
        },
      });
      console.log(`✅ 已创建系统配置 ${cfg.key}`);
    }
  }

  // ── 5. 清理旧菜单（老结构遗留）──
  // 对齐老项目：管理端无"用户中心"、无独立"回收站"菜单，
  // 软删除已集成到账户列表（显示已删除），权限点在隐藏的全局权限目录下。
  // 注意：种子只做增量对齐，被移除的菜单不会自动消失，必须在此显式清理，
  // 否则旧行会一直残留在侧栏（回收站曾因此反复出现）。
  const LEGACY_MENU_CODES = [
    // 用户中心 分支（user-center / user:*）
    'user-center', 'user:list', 'user:create', 'user:update', 'user:delete',
    // 独立回收站菜单（已废弃，软删除集成进账户列表）
    'recycle:list',
    // 旧后台设置权限码 config:admin → 已升级为 config:admin:view
    'config:admin',
  ];
  const legacyMenus = await prisma.adminMenu.findMany({
    where: { code: { in: LEGACY_MENU_CODES } },
    select: { id: true, code: true },
  });
  if (legacyMenus.length > 0) {
    const legacyIds = legacyMenus.map((m) => m.id);
    await prisma.adminAccountMenu.deleteMany({ where: { menuId: { in: legacyIds } } });
    await prisma.adminRoleMenu.deleteMany({ where: { menuId: { in: legacyIds } } });
    await prisma.adminMenu.deleteMany({ where: { id: { in: legacyIds } } });
    console.log(`🗑️ 已清理旧菜单/权限点 ${legacyMenus.length} 个（${legacyMenus.map((m) => m.code).join(', ')}）`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
