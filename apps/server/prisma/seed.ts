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

  // ── 3. 权限点种子（user 模块 CRUD 权限）+ 绑定到 super_admin ──
  const userPermissions = [
    { code: 'user:list', name: '用户列表', type: 'menu' },
    { code: 'user:create', name: '新建用户', type: 'button' },
    { code: 'user:update', name: '编辑用户', type: 'button' },
    { code: 'user:delete', name: '删除用户', type: 'button' },
  ];
  const superAdminRole = await prisma.adminRole.findUnique({ where: { code: 'super_admin' } });
  if (superAdminRole) {
    for (const perm of userPermissions) {
      const menu = await prisma.adminMenu.upsert({
        where: { code: perm.code },
        update: {},
        create: { id: newId(), code: perm.code, name: perm.name, type: perm.type },
      });
      // 角色-权限绑定（幂等）
      const bound = await prisma.adminRoleMenu.findUnique({
        where: { roleId_menuId: { roleId: superAdminRole.id, menuId: menu.id } },
      });
      if (!bound) {
        await prisma.adminRoleMenu.create({
          data: { id: newId(), roleId: superAdminRole.id, menuId: menu.id },
        });
      }
    }
    console.log('✅ 已绑定 super_admin 的 user 权限点');
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
