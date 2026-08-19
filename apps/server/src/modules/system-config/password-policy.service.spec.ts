import { describe, expect, it, vi } from 'vitest';
import { PasswordPolicyService } from './password-policy.service.js';
import { SystemConfigService } from './system-config.service.js';

/** 构造 service（mock SystemConfigService.getValue） */
function createService(settings: Record<string, unknown> | null) {
  const systemConfig = {
    getValue: vi.fn<any>().mockResolvedValue(settings),
  } as unknown as SystemConfigService;
  return new PasswordPolicyService(systemConfig);
}

describe('PasswordPolicyService', () => {
  it('getPolicy：无配置回退默认（min 8 / medium）', async () => {
    const service = createService(null);
    await expect(service.getPolicy()).resolves.toEqual({
      minLength: 8,
      complexity: 'medium',
    });
  });

  it('getPolicy：读取后台设置配置', async () => {
    const service = createService({
      passwordMinLength: 12,
      passwordComplexity: 'high',
    });
    await expect(service.getPolicy()).resolves.toEqual({
      minLength: 12,
      complexity: 'high',
    });
  });

  it('getPolicy：非法值回退默认', async () => {
    const service = createService({
      passwordMinLength: 1,
      passwordComplexity: 'unknown',
    });
    await expect(service.getPolicy()).resolves.toEqual({
      minLength: 8,
      complexity: 'medium',
    });
  });

  it('low：仅校验长度', async () => {
    const service = createService({
      passwordMinLength: 6,
      passwordComplexity: 'low',
    });
    await expect(service.assertValid('abcdef')).resolves.toBeUndefined();
  });

  it('medium：纯数字 / 纯字母被拒', async () => {
    const service = createService({
      passwordMinLength: 8,
      passwordComplexity: 'medium',
    });
    await expect(service.assertValid('12345678')).rejects.toMatchObject({
      code: 'PASSWORD_POLICY_VIOLATION',
      message: '密码必须同时包含字母和数字',
    });
    await expect(service.assertValid('abcdefgh')).rejects.toMatchObject({
      code: 'PASSWORD_POLICY_VIOLATION',
    });
  });

  it('high：缺少大写/小写/数字/特殊字符任一被拒', async () => {
    const service = createService({
      passwordMinLength: 8,
      passwordComplexity: 'high',
    });
    await expect(service.assertValid('abcd1234')).rejects.toMatchObject({
      code: 'PASSWORD_POLICY_VIOLATION',
      message: '密码必须包含大写字母、小写字母、数字和特殊字符',
    });
    await expect(service.assertValid('Abcd1234!')).resolves.toBeUndefined();
  });

  it('assertValid：长度不足抛 BizException', async () => {
    const service = createService({
      passwordMinLength: 12,
      passwordComplexity: 'low',
    });
    await expect(service.assertValid('short')).rejects.toMatchObject({
      code: 'PASSWORD_POLICY_VIOLATION',
      message: '密码至少 12 位',
    });
  });
});
