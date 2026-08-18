import { newId } from '@starter/server-core';
import bcrypt from 'bcrypt';
import type { SeedDb } from './shared.js';

/**
 * 演示数据（仅非生产创建，入口 seed.ts 已做生产守卫）：
 * - 演示用户 alice/bob/carol（C 端 User）
 * - 演示角色 运营专员（operator）+ 部分权限绑定
 * - 演示账号 operator1（特例授权演示）+ 特例授权实例（admin_account_menu）
 * - 软删除演示账号 deleted_demo（「显示已删除」视图可见）
 *
 * 生产环境不需要这些数据；如需裁剪，删除 seed.ts 中对 seedDemo 的调用即可。
 */
export async function seedDemo(db: SeedDb): Promise<void> {
  // ── 演示用户（幂等补数据：只创建缺失的，重复执行安全） ──
  const DEMO_USERS = [
    {
      username: 'alice',
      email: 'alice@example.com',
      role: 'member' as const,
      status: 'active' as const,
    },
    {
      username: 'bob',
      email: 'bob@example.com',
      role: 'member' as const,
      status: 'active' as const,
    },
    {
      username: 'carol',
      email: 'carol@example.com',
      role: 'admin' as const,
      status: 'active' as const,
    },
  ];
  for (const demo of DEMO_USERS) {
    // rawClient 查含软删记录（username 唯一约束包括软删行），存在则跳过
    const existing = await db.user.findFirst({
      where: { username: demo.username },
    });
    if (!existing) {
      await db.user.create({ data: { id: newId(), ...demo } });
      console.log(`✅ 已创建演示用户 ${demo.username}`);
    }
  }

  // ── 演示角色 运营专员（operator）：只拥有部分权限，用于特例授权演示 ──
  // 基线权限 account:list / account:update / role:list，
  // 配合 operator1 的账户级特例授权，可在「特例授权」弹窗直观看到覆盖效果
  const OPERATOR_CODES = ['account:list', 'account:update', 'role:list'];
  let operatorRole = await db.adminRole.findUnique({
    where: { code: 'operator' },
  });
  if (!operatorRole) {
    operatorRole = await db.adminRole.create({
      data: {
        id: newId(),
        name: '运营专员',
        code: 'operator',
        description:
          '演示角色：拥有部分权限（账户管理/角色权限），用于特例授权演示',
      },
    });
    console.log('✅ 已创建演示角色 运营专员（operator）');
  }
  // 幂等绑定部分权限
  const operatorMenus = await db.adminMenu.findMany({
    where: { code: { in: OPERATOR_CODES } },
    select: { id: true },
  });
  for (const menu of operatorMenus) {
    const bound = await db.adminRoleMenu.findUnique({
      where: { roleId_menuId: { roleId: operatorRole.id, menuId: menu.id } },
    });
    if (!bound) {
      await db.adminRoleMenu.create({
        data: { id: newId(), roleId: operatorRole.id, menuId: menu.id },
      });
    }
  }

  // ── 演示账号 operator1（绑定运营专员角色 + 特例授权实例） ──
  const operatorIdentity = await db.accountIdentity.findUnique({
    where: {
      identityType_identifier: {
        identityType: 'username',
        identifier: 'operator1',
      },
    },
  });
  if (!operatorIdentity) {
    const accountId = newId();
    await db.$transaction(async (tx) => {
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
    console.log(
      '✅ 已创建演示账号 operator1（角色 运营专员），初始密码见部署文档',
    );
  }

  // ── 特例授权实例（admin_account_menu） ──
  // operator1 角色基线只有 account:list/update/role:list；
  // 这里 grant account:delete（角色之外的追加授权），
  // 打开「特例授权」弹窗可直观看到一条"允许"覆盖（grant 追加、deny 移除，deny 优先）
  const operatorAccountId =
    operatorIdentity?.accountId ??
    (
      await db.accountIdentity.findUnique({
        where: {
          identityType_identifier: {
            identityType: 'username',
            identifier: 'operator1',
          },
        },
        select: { accountId: true },
      })
    )?.accountId;
  const grantMenu = await db.adminMenu.findUnique({
    where: { code: 'account:delete' },
  });
  if (operatorAccountId && grantMenu) {
    await db.adminAccountMenu.upsert({
      where: {
        accountId_menuId: {
          accountId: operatorAccountId,
          menuId: grantMenu.id,
        },
      },
      update: { type: 'grant' },
      create: {
        id: newId(),
        accountId: operatorAccountId,
        menuId: grantMenu.id,
        type: 'grant',
      },
    });
    console.log(
      '✅ 已对齐特例授权实例：operator1 追加 account:delete（grant）',
    );
  }

  // ── 演示软删除数据：deleted_demo（已删除演示账号，用于展示软删除视图） ──
  const deletedDemoIdentity = await db.accountIdentity.findUnique({
    where: {
      identityType_identifier: {
        identityType: 'username',
        identifier: 'deleted_demo',
      },
    },
  });
  if (!deletedDemoIdentity) {
    const accountId = newId();
    await db.$transaction(async (tx) => {
      await tx.account.create({
        data: {
          id: accountId,
          userType: 'admin',
          enabled: true,
          deletedAt: new Date(),
        },
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
      await tx.adminAccountRole.create({
        data: { id: newId(), accountId, roleId: operatorRole.id },
      });
    });
    console.log(
      '✅ 已创建软删除演示账号 deleted_demo（在「显示已删除」视图可见）',
    );
  }
}
