import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('合法配置通过，字符串数字被 coerce', () => {
    const env = validateEnv({ NODE_ENV: 'development', PORT: '3301', LOG_LEVEL: 'log' });
    expect(env.PORT).toBe(3301);
  });

  it('缺失项使用默认值', () => {
    expect(validateEnv({}).PORT).toBe(3301);
  });

  it('非法 PORT fail-fast 且错误信息可读', () => {
    expect(() => validateEnv({ PORT: 'not-a-number' })).toThrow(/PORT/);
  });

  it('非法枚举值抛错', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('非法配置不返回部分结果', () => {
    expect(() => validateEnv({ PORT: '0' })).toThrow(/PORT/);
  });
});
