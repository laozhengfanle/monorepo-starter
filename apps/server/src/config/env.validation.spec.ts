import { validateEnv } from './env.validation.js';

const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test?schema=public';
const JWT_SECRET = 'test-secret-0123456789abcdef';

describe('validateEnv', () => {
  it('合法配置通过，字符串数字被 coerce', () => {
    const env = validateEnv({ NODE_ENV: 'development', PORT: '3301', LOG_LEVEL: 'log', DATABASE_URL, JWT_SECRET });
    expect(env.PORT).toBe(3301);
  });

  it('缺失可选项使用默认值（DATABASE_URL/JWT_SECRET 必填）', () => {
    expect(validateEnv({ DATABASE_URL, JWT_SECRET }).PORT).toBe(3301);
  });

  it('缺失 DATABASE_URL fail-fast', () => {
    expect(() => validateEnv({ JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('缺失 JWT_SECRET fail-fast', () => {
    expect(() => validateEnv({ DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('非法 PORT fail-fast 且错误信息可读', () => {
    expect(() => validateEnv({ PORT: 'not-a-number', DATABASE_URL, JWT_SECRET })).toThrow(/PORT/);
  });

  it('非法枚举值抛错', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging', DATABASE_URL, JWT_SECRET })).toThrow(/NODE_ENV/);
  });

  it('非法配置不返回部分结果', () => {
    expect(() => validateEnv({ PORT: '0', DATABASE_URL, JWT_SECRET })).toThrow(/PORT/);
  });
});
