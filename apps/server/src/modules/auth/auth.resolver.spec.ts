import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { AuthResolver } from './auth.resolver.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('AuthResolver', () => {
  let resolver: AuthResolver;
  let authService: { me: ReturnType<typeof vi.fn<any>> };

  beforeEach(async () => {
    authService = {
      me: vi.fn<any>().mockResolvedValue({
        accountId: 'acc-1',
        username: 'root',
        nickname: '',
        avatar: '',
        email: '',
        phone: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        roleCodes: ['super_admin'],
        permissions: [],
        menus: [],
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthResolver,
        { provide: AuthService, useValue: authService },
      ],
    })
      // @UseGuards(JwtAuthGuard) 会让 Nest 在模块初始化时实例化守卫，
      // 用 overrideGuard 提供 mock（守卫逻辑本身由 jwt-auth.guard.spec 覆盖）
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: vi.fn<any>(() => true) })
      .compile();
    resolver = moduleRef.get(AuthResolver);
  });

  it('me 查询挂 JwtAuthGuard（未登录不能查自身）', () => {
    // 方法级 @UseGuards：Nest 存在 (方法函数, '__guards__') 上（@nestjs/common GUARDS_METADATA）
    const guards =
      Reflect.getMetadata('__guards__', AuthResolver.prototype.me) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('me 查询：透传当前用户 accountId 到 AuthService', async () => {
    await resolver.me({ accountId: 'acc-1', userType: 'admin' });

    expect(authService.me).toHaveBeenCalledWith('acc-1');
  });

  it('me 查询：返回 AuthService 结果', async () => {
    const result = await resolver.me({
      accountId: 'acc-1',
      userType: 'admin',
    });

    expect(result.username).toBe('root');
    expect(result.roleCodes).toEqual(['super_admin']);
  });
});
