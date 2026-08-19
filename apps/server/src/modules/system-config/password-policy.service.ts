import { Injectable } from '@nestjs/common';
import { BizException } from '@starter/server-core';
import { SystemConfigService } from './system-config.service.js';

/** 密码复杂度等级（与后台设置页面选项一致） */
export type PasswordComplexity = 'low' | 'medium' | 'high';

export interface PasswordPolicy {
  /** 密码最小长度（后台设置 settings.passwordMinLength，默认 8） */
  minLength: number;
  /** 密码复杂度（后台设置 settings.passwordComplexity，默认 medium） */
  complexity: PasswordComplexity;
}

/** 默认密码策略：与后台设置页面/前端 DEFAULT_SETTINGS 保持一致 */
const DEFAULT_MIN_LENGTH = 8;
const DEFAULT_COMPLEXITY: PasswordComplexity = 'medium';

/** 复杂度正则：medium = 字母 + 数字；high = 大小写 + 数字 + 特殊字符 */
const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /\d/;
const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

/**
 * 密码策略校验（后台设置「安全策略」的落地执行）：
 * - 读 system_config settings.passwordMinLength / passwordComplexity（缓存 30 分钟），
 *   读取异常时回退默认值（8 / medium），保证登录链路不被配置故障卡死
 * - 管理员创建账户、个人修改密码等「设置新密码」入口统一调用 assertValid
 * - 复杂度规则：low 仅长度；medium 必须同时含字母和数字；high 必须含大小写字母、数字、特殊字符
 */
@Injectable()
export class PasswordPolicyService {
  constructor(private readonly systemConfig: SystemConfigService) {}

  /** 读取当前密码策略（后台设置优先，异常/缺失回退默认） */
  async getPolicy(): Promise<PasswordPolicy> {
    try {
      const settings = await this.systemConfig.getValue<{
        passwordMinLength?: number;
        passwordComplexity?: PasswordComplexity;
      }>('settings');
      const minLength =
        typeof settings?.passwordMinLength === 'number' &&
        settings.passwordMinLength >= 6 &&
        settings.passwordMinLength <= 32
          ? settings.passwordMinLength
          : DEFAULT_MIN_LENGTH;
      const complexity =
        settings?.passwordComplexity === 'low' ||
        settings?.passwordComplexity === 'medium' ||
        settings?.passwordComplexity === 'high'
          ? settings.passwordComplexity
          : DEFAULT_COMPLEXITY;
      return { minLength, complexity };
    } catch {
      // 配置读取失败时静默回退（与 LoginLockService 一致）
      return { minLength: DEFAULT_MIN_LENGTH, complexity: DEFAULT_COMPLEXITY };
    }
  }

  /** 校验密码是否符合当前策略；不符合抛 BizException(PASSWORD_POLICY_VIOLATION) */
  async assertValid(password: string): Promise<void> {
    const policy = await this.getPolicy();
    if (password.length < policy.minLength) {
      throw new BizException({
        code: 'PASSWORD_POLICY_VIOLATION',
        message: `密码至少 ${policy.minLength} 位`,
      });
    }
    if (policy.complexity === 'medium') {
      if (!HAS_LETTER.test(password) || !HAS_DIGIT.test(password)) {
        throw new BizException({
          code: 'PASSWORD_POLICY_VIOLATION',
          message: '密码必须同时包含字母和数字',
        });
      }
    } else if (policy.complexity === 'high') {
      if (
        !HAS_LOWER.test(password) ||
        !HAS_UPPER.test(password) ||
        !HAS_DIGIT.test(password) ||
        !HAS_SPECIAL.test(password)
      ) {
        throw new BizException({
          code: 'PASSWORD_POLICY_VIOLATION',
          message: '密码必须包含大写字母、小写字母、数字和特殊字符',
        });
      }
    }
    // low：仅长度要求
  }
}
