import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_RESOURCE_MAP,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_LABELS,
  AUDIT_RESOURCES,
} from './audit.constants.js';

/**
 * 审计词表一致性测试：
 * 单一事实源 audit.constants.ts 必须自洽 ——
 * 1. 每个 action 都有中文标签（字典 audit_action 生成源）
 * 2. 每个 action 都有默认资源类型映射（AuditService 自动补全）
 * 3. 每个 resourceType 都有中文标签（字典 audit_resource 生成源）
 * 4. action / resourceType 无重复值（字典项唯一）
 */
describe('audit.constants 词表一致性', () => {
  const actions = Object.values(AUDIT_ACTIONS);
  const resources = Object.values(AUDIT_RESOURCES);

  it('action 值不重复', () => {
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('resourceType 值不重复', () => {
    expect(new Set(resources).size).toBe(resources.length);
  });

  it('每个 action 都有中文标签', () => {
    for (const action of actions) {
      expect(AUDIT_ACTION_LABELS[action], `缺少 action 标签: ${action}`).toBeTruthy();
    }
  });

  it('每个 action 都有默认资源类型映射', () => {
    for (const action of actions) {
      expect(
        AUDIT_ACTION_RESOURCE_MAP[action],
        `缺少 action 默认资源类型: ${action}`,
      ).toBeTruthy();
    }
  });

  it('默认资源类型映射指向已定义的资源类型', () => {
    for (const action of actions) {
      const resource = AUDIT_ACTION_RESOURCE_MAP[action];
      expect(resources, `action=${action} 映射到未定义的资源类型: ${resource}`).toContain(resource);
    }
  });

  it('每个 resourceType 都有中文标签', () => {
    for (const resource of resources) {
      expect(AUDIT_RESOURCE_LABELS[resource], `缺少资源类型标签: ${resource}`).toBeTruthy();
    }
  });

  it('标签 map 的键与词表一一对应（无多余键）', () => {
    expect(Object.keys(AUDIT_ACTION_LABELS).sort()).toEqual([...actions].sort());
    expect(Object.keys(AUDIT_RESOURCE_LABELS).sort()).toEqual([...resources].sort());
    expect(Object.keys(AUDIT_ACTION_RESOURCE_MAP).sort()).toEqual([...actions].sort());
  });
});
