import { CreateUserSchema, UpdateUserSchema, UserVoSchema } from './users.js';

const VALID_USER = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  username: 'alice',
  email: 'alice@example.com',
  role: 'member',
  status: 'active',
  createdAt: '2026-08-13T12:00:00.000Z',
};

describe('CreateUserSchema', () => {
  it('合法输入通过并应用默认值', () => {
    const result = CreateUserSchema.parse({ username: 'alice', email: 'alice@example.com' });
    expect(result.role).toBe('member');
    expect(result.status).toBe('active');
  });

  it('用户名过短被拒绝', () => {
    expect(CreateUserSchema.safeParse({ username: 'ab', email: 'a@b.com' }).success).toBe(false);
  });

  it('邮箱格式错误被拒绝', () => {
    expect(CreateUserSchema.safeParse({ username: 'alice', email: 'not-an-email' }).success).toBe(false);
  });

  it('非法角色枚举被拒绝', () => {
    expect(
      CreateUserSchema.safeParse({ username: 'alice', email: 'a@b.com', role: 'root' }).success,
    ).toBe(false);
  });
});

describe('UpdateUserSchema', () => {
  it('空对象合法（全字段可选）', () => {
    expect(UpdateUserSchema.parse({})).toEqual({});
  });

  it('传入字段时复用 Create 的校验规则', () => {
    expect(UpdateUserSchema.safeParse({ username: 'a' }).success).toBe(false);
    expect(UpdateUserSchema.parse({ username: 'bob' }).username).toBe('bob');
  });
});

describe('UserVoSchema', () => {
  it('合法出参通过', () => {
    expect(UserVoSchema.parse(VALID_USER)).toEqual(VALID_USER);
  });

  it('id 非 uuid 被拒绝', () => {
    expect(UserVoSchema.safeParse({ ...VALID_USER, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('createdAt 非 ISO 时间被拒绝', () => {
    expect(UserVoSchema.safeParse({ ...VALID_USER, createdAt: 'yesterday' }).success).toBe(false);
  });
});
