import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { DashboardService } from './dashboard.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** 构造 PrismaService 桩 */
function createPrismaStub(
  overrides: Record<string, unknown> = {},
): PrismaService {
  return {
    client: {
      account: { count: vi.fn<any>().mockResolvedValue(3) },
      adminRole: { count: vi.fn<any>().mockResolvedValue(5) },
      adminMenu: { count: vi.fn<any>().mockResolvedValue(20) },
      auditLog: {
        count: vi.fn<any>().mockResolvedValue(100),
        findMany: vi.fn<any>().mockResolvedValue([]),
        groupBy: vi.fn<any>().mockResolvedValue([]),
      },
      accountIdentity: {
        findMany: vi.fn<any>().mockResolvedValue([]),
      },
      ...overrides,
    },
  } as unknown as PrismaService;
}

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaService;

  beforeEach(async () => {
    prisma = createPrismaStub();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(DashboardService);
  });

  it('getStats：返回统计卡片与趋势', async () => {
    const stats = await service.getStats();

    // 4 张卡片：管理员 / 角色 / 菜单项 / 近7日操作
    expect(stats).toHaveLength(4);
    expect(stats[0]).toMatchObject({
      label: expect.any(String),
      value: expect.any(Number),
    });
    expect(typeof stats[0].trend).toBe('number');
    expect(stats.map((s) => s.label)).toEqual([
      '管理员',
      '角色',
      '菜单项',
      '近7日操作',
    ]);
  });

  it('getTrend(week)：按风险等级拆分审计操作', async () => {
    // 构造 3 种风险的日志：高危（login_locked）、中危（login_failed）、低危（login_success）
    (
      prisma.client.auditLog.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { action: 'login_locked', createdAt: new Date() },
      { action: 'login_failed', createdAt: new Date() },
      { action: 'login_success', createdAt: new Date() },
    ]);

    const trend = await service.getTrend('week');
    const today = trend.find(
      (t) => t.label === `${new Date().getMonth() + 1}/${new Date().getDate()}`,
    );

    expect(today).toBeDefined();
    expect(today?.highRisk).toBe(1);
    expect(today?.midRisk).toBe(1);
    expect(today?.lowRisk).toBe(1);
  });

  it('getDistribution：计算百分比并按 Top 排序', async () => {
    (
      prisma.client.auditLog.groupBy as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { action: 'login_success', _count: { action: 80 } },
      { action: 'login_failed', _count: { action: 20 } },
    ]);

    const dist = await service.getDistribution();

    expect(dist).toHaveLength(2);
    expect(dist[0].percent).toBe(80);
    expect(dist[1].percent).toBe(20);
    expect(dist.every((d) => d.label && d.color)).toBe(true);
  });

  it('getOperationLogs：分页参数边界收敛（page>=1，size<=50）', async () => {
    (
      prisma.client.auditLog.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        id: '1',
        action: 'login_success',
        accountId: null,
        resourceType: null,
        ip: '127.0.0.1',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getOperationLogs(-5, 999);

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.total).toBe(100);
    expect(result.list[0].user).toBe('系统');
  });

  it('getOperationLogs：操作者用户名批量 join', async () => {
    (
      prisma.client.auditLog.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        id: '1',
        action: 'config:update',
        accountId: 'acc-1',
        resourceType: 'config',
        ip: '127.0.0.1',
        createdAt: new Date(),
      },
    ]);
    (
      prisma.client.accountIdentity.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ accountId: 'acc-1', identifier: 'admin' }]);

    const result = await service.getOperationLogs(1, 10);

    expect(result.list[0].user).toBe('admin');
    expect(result.list[0].module).toBeTruthy();
  });
});
