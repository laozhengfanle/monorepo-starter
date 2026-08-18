import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
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
      // getTrend 走 SQL 预聚合（$queryRaw），不拉全量审计入内存
      $queryRaw: vi.fn<any>().mockResolvedValue([]),
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

  afterEach(() => {
    vi.useRealTimers();
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

  it('getTrend(week)：SQL 预聚合行 → 按风险等级拆分到天桶', async () => {
    // 2026-01-05（周一）固定系统时钟，桶标签确定
    vi.setSystemTime(new Date('2026-01-05T10:00:00Z'));
    (prisma.client.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      // 高危（login_locked）/ 中危（login_failed）/ 低危（login_success）
      { bucket: '2026-01-05', action: 'login_locked', count: 1 },
      { bucket: '2026-01-05', action: 'login_failed', count: 1 },
      { bucket: '2026-01-05', action: 'login_success', count: 1 },
    ]);

    const trend = await service.getTrend('week');
    const monday = trend.find((t) => t.label === '1/5');

    expect(monday).toBeDefined();
    expect(monday?.highRisk).toBe(1);
    expect(monday?.midRisk).toBe(1);
    expect(monday?.lowRisk).toBe(1);
  });

  it('getTrend：不再走 auditLog.findMany 全量拉取（防 OOM 上限）', async () => {
    vi.setSystemTime(new Date('2026-01-05T10:00:00Z'));

    await service.getTrend('week');

    expect(
      prisma.client.auditLog.findMany as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(
      prisma.client.$queryRaw as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledTimes(1);
    // 参数化 Prisma.sql（模板对象含 strings/values），非字符串拼接 SQL
    const [sql] = (prisma.client.$queryRaw as ReturnType<typeof vi.fn>).mock
      .calls[0] as [unknown];
    expect(sql).toBeTypeOf('object');
    expect((sql as { strings?: unknown }).strings).toBeDefined();
    expect((sql as { values?: unknown }).values).toBeDefined();
  });

  it('getTrend(year)：按月聚合为 12 个桶（label 为 N月）', async () => {
    vi.setSystemTime(new Date('2026-06-15T10:00:00Z'));
    (prisma.client.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { bucket: '2026-03-01', action: 'login_failed', count: 4 }, // 中危 → 3月
      { bucket: '2026-06-01', action: 'password_changed', count: 2 }, // 高危 → 6月
      { bucket: '2026-06-02', action: 'logout', count: 7 }, // 低危 → 6月
    ]);

    const result = await service.getTrend('year');

    expect(result).toHaveLength(12);
    expect(result[2]).toEqual({
      label: '3月',
      highRisk: 0,
      midRisk: 4,
      lowRisk: 0,
    });
    expect(result[5]).toEqual({
      label: '6月',
      highRisk: 2,
      midRisk: 0,
      lowRisk: 7,
    });
  });

  it('getTrend(month)：本月 1 号至今逐日分桶', async () => {
    vi.setSystemTime(new Date('2026-02-03T10:00:00Z'));
    (prisma.client.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { bucket: '2026-02-02', action: 'login_success', count: 1 },
    ]);

    const result = await service.getTrend('month');

    // 2 月（非闰年）1-3 日，共 3 桶
    expect(result.map((r) => r.label)).toEqual(['2/1', '2/2', '2/3']);
    expect(result[1]).toEqual({
      label: '2/2',
      highRisk: 0,
      midRisk: 0,
      lowRisk: 1,
    });
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
