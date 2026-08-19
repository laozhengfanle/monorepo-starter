import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { NotificationsGateway } from './notifications.gateway.js';
import { WsJwtGuard } from './ws-jwt.guard.js';

interface FakeServer {
  use: ReturnType<typeof vi.fn<any>>;
  sockets: {
    sockets: Map<string, { disconnect: ReturnType<typeof vi.fn<any>> }>;
  };
}

function makeServer(): FakeServer {
  return { use: vi.fn<any>(), sockets: { sockets: new Map() } };
}

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let guard: {
    verifyHandshake: ReturnType<typeof vi.fn<any>>;
    validateClient: ReturnType<typeof vi.fn<any>>;
  };

  beforeEach(() => {
    guard = {
      verifyHandshake: vi.fn<any>(),
      validateClient: vi.fn<any>().mockResolvedValue(true),
    };
    gateway = new NotificationsGateway(guard as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('afterInit：注册握手鉴权 middleware（校验失败拒绝连接）', () => {
    const server = makeServer();

    gateway.afterInit(server as never);

    expect(server.use).toHaveBeenCalledWith(expect.any(Function));
    gateway.onModuleDestroy();
  });

  it('消息处理器挂载 WsJwtGuard（消息级双保险，每条消息重新校验 token）', () => {
    // 类级 @UseGuards：Nest 存在 (类, '__guards__') 上（@nestjs/common GUARDS_METADATA）
    const guards =
      Reflect.getMetadata('__guards__', NotificationsGateway) ?? [];
    expect(guards).toContain(WsJwtGuard);
  });

  it('周期复核：token 已撤销的连接被断开（解决撤销后已连接 socket 不失效）', async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn<any>();
    const server = makeServer();
    server.sockets.sockets.set('s1', { disconnect });
    // token 撤销后 validateClient 失败
    guard.validateClient.mockRejectedValueOnce(new Error('Token 已撤销'));

    gateway.afterInit(server as never);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(guard.validateClient).toHaveBeenCalledWith(
      server.sockets.sockets.get('s1'),
    );
    expect(disconnect).toHaveBeenCalledWith(true);
    gateway.onModuleDestroy();
  });

  it('周期复核：token 仍有效的连接保持在线（不误断开）', async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn<any>();
    const server = makeServer();
    server.sockets.sockets.set('s1', { disconnect });

    gateway.afterInit(server as never);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(disconnect).not.toHaveBeenCalled();
    gateway.onModuleDestroy();
  });

  it('onModuleDestroy：清理周期复核定时器', () => {
    vi.useFakeTimers();
    gateway.afterInit(makeServer() as never);
    const timerBefore = vi.getTimerCount();

    gateway.onModuleDestroy();

    expect(vi.getTimerCount()).toBeLessThan(timerBefore);
  });

  it('ping → pong', () => {
    expect(gateway.handlePing()).toBe('pong');
  });

  it('whoami → 返回握手时挂载的当前账户', () => {
    const client = {
      data: { account: { accountId: 'acc-1', userType: 'admin' } },
    };

    expect(gateway.handleWhoAmI(client as never)).toEqual({
      accountId: 'acc-1',
      userType: 'admin',
    });
  });

  it('notify → 回显消息（缺 body 回退空串）', () => {
    expect(gateway.handleNotify({ message: 'hello' })).toEqual({
      received: 'hello',
    });
    expect(gateway.handleNotify(undefined as never)).toEqual({
      received: '',
    });
  });
});
