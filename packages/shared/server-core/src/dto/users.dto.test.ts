import { CreateUserDto, PaginatedUsersResponseDto, QueryUsersDto, UpdateUserDto, UserVo } from './users.dto.js';

describe('users DTO（createZodDto）', () => {
  it('CreateUserDto 携带可校验的 schema', () => {
    expect(CreateUserDto.schema).toBeDefined();
    expect(CreateUserDto.schema.safeParse({ username: 'alice', email: 'a@b.com' }).success).toBe(true);
  });

  it('UpdateUserDto 接受部分字段', () => {
    expect(UpdateUserDto.schema.parse({ username: 'bob' })).toEqual({ username: 'bob' });
  });

  it('QueryUsersDto 校验分页参数', () => {
    expect(QueryUsersDto.schema.parse({ page: '2', pageSize: '10' })).toEqual({ page: 2, pageSize: 10 });
  });

  it('UserVo 校验出参结构', () => {
    expect(
      UserVo.schema.safeParse({
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        username: 'alice',
        email: 'alice@example.com',
        role: 'member',
        status: 'active',
        createdAt: '2026-08-13T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('PaginatedUsersResponseDto 校验分页负载', () => {
    const result = PaginatedUsersResponseDto.schema.safeParse({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });
});
