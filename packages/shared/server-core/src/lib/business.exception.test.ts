import { BizException } from './business.exception.js';

describe('BizException', () => {
  it('携带业务错误码与用户可读消息', () => {
    const ex = new BizException({ code: 'USER_NOT_FOUND', message: '用户不存在' });

    expect(ex).toBeInstanceOf(Error);
    expect(ex.name).toBe('BizException');
    expect(ex.code).toBe('USER_NOT_FOUND');
    expect(ex.message).toBe('用户不存在');
    expect(ex.details).toBeUndefined();
  });

  it('可选携带字段级错误详情', () => {
    const ex = new BizException({
      code: 'USERNAME_TAKEN',
      message: '用户名已存在',
      details: { username: ['已被占用'] },
    });

    expect(ex.details).toEqual({ username: ['已被占用'] });
  });
});
