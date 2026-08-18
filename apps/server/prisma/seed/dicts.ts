import { newId } from '@starter/server-core';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_RESOURCE_LABELS,
} from '../../src/modules/auth/audit.constants.js';
import type { SeedDb } from './shared.js';

/**
 * 数据字典种子（核心主数据）：常用可配置枚举统一入字典。
 * 审计操作/资源类型 由 audit.constants.ts 单一事实源生成，词表变更后 seed 会清理过期项。
 */
export async function seedDicts(db: SeedDb): Promise<void> {
  const DICT_SEED: {
    code: string;
    name: string;
    remark?: string;
    items: { label: string; value: string; remark?: string; sort?: number }[];
  }[] = [
    {
      code: 'audit_action',
      name: '审计操作类型',
      remark:
        '审计日志 action 的可选项（audit_log.action）—— 由 audit.constants.ts 单一事实源生成',
      // 与 AUDIT_ACTIONS 常量严格一致：新增动作只改 audit.constants.ts，勿在此手写
      items: (Object.entries(AUDIT_ACTION_LABELS) as [string, string][]).map(
        ([value, label], index) => ({ label, value, sort: index + 1 }),
      ),
    },
    {
      code: 'audit_resource',
      name: '审计资源类型',
      remark:
        '审计日志 resourceType 的可选项 —— 由 audit.constants.ts 单一事实源生成',
      items: (Object.entries(AUDIT_RESOURCE_LABELS) as [string, string][]).map(
        ([value, label], index) => ({ label, value, sort: index + 1 }),
      ),
    },
    {
      code: 'menu_type',
      name: '菜单类型',
      remark: 'admin_menu.type 的可选项',
      items: [
        { label: '目录', value: 'directory', sort: 1 },
        { label: '菜单', value: 'menu', sort: 2 },
        { label: '按钮', value: 'button', sort: 3 },
      ],
    },
    {
      code: 'password_complexity',
      name: '密码复杂度',
      remark: '后台设置 settings.passwordComplexity 的可选项',
      items: [
        { label: '低（仅长度要求）', value: 'low', sort: 1 },
        { label: '中（含字母和数字）', value: 'medium', sort: 2 },
        { label: '高（含大小写/数字/特殊字符）', value: 'high', sort: 3 },
      ],
    },
    {
      code: 'storage_driver',
      name: '存储驱动',
      remark: '文件存储 storage.driver 的可选项',
      items: [
        { label: '本地存储', value: 'local', sort: 1 },
        { label: '阿里云 OSS', value: 'oss', sort: 2 },
        { label: '腾讯云 COS', value: 'cos', sort: 3 },
        { label: 'AWS S3', value: 's3', sort: 4 },
      ],
    },
    {
      code: 'account_status',
      name: '账户状态',
      remark: '管理账户状态的可选项（正常/禁用/已删除）',
      items: [
        { label: '正常', value: 'active', sort: 1 },
        { label: '禁用', value: 'disabled', sort: 2 },
        { label: '已删除', value: 'deleted', sort: 3 },
      ],
    },
    {
      code: 'cache_type',
      name: '缓存类型',
      remark: 'Redis key 类型（缓存管理页展示）',
      items: [
        { label: '字符串', value: 'string', sort: 1 },
        { label: '哈希', value: 'hash', sort: 2 },
        { label: '列表', value: 'list', sort: 3 },
        { label: '集合', value: 'set', sort: 4 },
        { label: '有序集合', value: 'zset', sort: 5 },
        { label: '流', value: 'stream', sort: 6 },
      ],
    },
  ];

  for (const dict of DICT_SEED) {
    let type = await db.sysDictType.findUnique({
      where: { code: dict.code },
    });
    if (!type) {
      type = await db.sysDictType.create({
        data: {
          id: newId(),
          code: dict.code,
          name: dict.name,
          remark: dict.remark ?? null,
        },
      });
      console.log(`✅ 已创建字典类型 ${dict.code}（${dict.name}）`);
    }
    // 幂等补项（缺失才创建，已存在不覆盖，保留用户修改）
    for (const item of dict.items) {
      const existing = await db.sysDictItem.findFirst({
        where: { dictTypeId: type.id, value: item.value },
      });
      if (!existing) {
        await db.sysDictItem.create({
          data: {
            id: newId(),
            dictTypeId: type.id,
            label: item.label,
            value: item.value,
            remark: item.remark ?? null,
            sort: item.sort ?? 0,
          },
        });
      }
    }
    // 审计词表对齐：audit_action / audit_resource 由 audit.constants.ts 单一事实源驱动，
    // 已从词表移除的旧项（如 reset_password）在此显式清理，避免幽灵项残留在筛选下拉。
    if (dict.code === 'audit_action' || dict.code === 'audit_resource') {
      const allowed = new Set(dict.items.map((i) => i.value));
      const stale = await db.sysDictItem.findMany({
        where: { dictTypeId: type.id, value: { notIn: [...allowed] } },
        select: { id: true, value: true },
      });
      if (stale.length > 0) {
        await db.sysDictItem.deleteMany({
          where: { id: { in: stale.map((s) => s.id) } },
        });
        console.log(
          `🧹 已清理字典 ${dict.code} 的过期项: ${stale.map((s) => s.value).join(', ')}`,
        );
      }
    }
  }
}
