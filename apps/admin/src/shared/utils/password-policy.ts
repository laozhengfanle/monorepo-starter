/**
 * 密码策略校验（与后端 PasswordPolicyService 规则一致）：
 * 后台设置「安全策略」的 passwordMinLength / passwordComplexity 动态生效。
 * 服务端为准，前端规则用于即时提示（规则不一致时以后端返回为准）。
 */

export interface PasswordPolicyInput {
  /** 密码最小长度（settings.passwordMinLength，默认 8） */
  passwordMinLength: number;
  /** 密码复杂度（settings.passwordComplexity：low/medium/high，默认 medium） */
  passwordComplexity: 'low' | 'medium' | 'high';
}

/** 校验密码是否符合策略；合规返回 null，不合规返回错误文案 */
export function checkPasswordPolicy(
  value: string,
  policy: PasswordPolicyInput,
): string | null {
  if (value.length < policy.passwordMinLength) {
    return `密码至少 ${policy.passwordMinLength} 位`;
  }
  if (policy.passwordComplexity === 'medium') {
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
      return '密码必须同时包含字母和数字';
    }
  } else if (policy.passwordComplexity === 'high') {
    if (
      !/[a-z]/.test(value) ||
      !/[A-Z]/.test(value) ||
      !/\d/.test(value) ||
      !/[^A-Za-z0-9]/.test(value)
    ) {
      return '密码必须包含大写字母、小写字母、数字和特殊字符';
    }
  }
  // low：仅长度要求
  return null;
}

/** antd Form 校验器（密码策略动态规则；空值放行由 required 规则负责） */
export function passwordPolicyRule(policy: PasswordPolicyInput): {
  validator: (_rule: unknown, value: string) => Promise<void>;
} {
  return {
    validator: (_rule, value) => {
      if (!value) return Promise.resolve();
      const message = checkPasswordPolicy(value, policy);
      return message ? Promise.reject(new Error(message)) : Promise.resolve();
    },
  };
}
