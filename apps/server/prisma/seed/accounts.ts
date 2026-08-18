import { newId } from '@starter/server-core';
import bcrypt from 'bcrypt';
import type { SeedDb } from './shared.js';

/**
 * 初始管理员（核心主数据）：root / Root!123。
 * 依赖：super_admin 角色已由 roles.ts 确保存在。
 * 幂等：按 username 身份标识判断，已存在则只同步头像。
 */
export async function seedAccounts(
  db: SeedDb,
  superAdminId: string,
): Promise<void> {
  const rootIdentity = await db.accountIdentity.findUnique({
    where: {
      identityType_identifier: { identityType: 'username', identifier: 'root' },
    },
  });
  if (!rootIdentity) {
    const accountId = newId();
    await db.$transaction(async (tx) => {
      // 账户（身份容器）
      await tx.account.create({
        data: { id: accountId, userType: 'admin', enabled: true },
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
      // 档案（默认头像 /avatar.jpeg：admin public 静态资源，seed 内置保证可用）
      await tx.adminProfile.create({
        data: {
          id: newId(),
          accountId,
          nickname: '超级管理员',
          avatar: '/avatar.jpeg',
        },
      });
      // 绑定超管角色
      await tx.adminAccountRole.create({
        data: { id: newId(), accountId, roleId: superAdminId },
      });
    });
    console.log('✅ 已创建初始管理员（角色 super_admin），初始密码见部署文档');
  } else {
    // 同步更新超管档案头像（幂等：每次 seed 都覆盖，保证 /avatar.jpeg 不会丢）
    await db.adminProfile.updateMany({
      where: { accountId: rootIdentity.accountId },
      data: { avatar: '/avatar.jpeg' },
    });
    console.log('root 账户已存在，跳过（头像已同步为 /avatar.jpeg）');
  }
}
