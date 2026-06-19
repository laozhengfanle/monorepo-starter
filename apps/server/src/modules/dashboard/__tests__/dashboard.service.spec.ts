/**
 * DashboardService 单元测试
 *
 * 覆盖场景：
 * - getStats：正常返回 / 空数据兜底（count 全 0 时降级为 value=0 的卡片）
 * - getDistribution：正常返回百分比 / 空数据时 percent=0
 * - getQuickEntries：system_config 缺失或 JSON 解析失败时降级为空数组
 *
 * 注意：DashboardService 实际公开方法为 getStats / getTrend / getDistribution /
 *      getOperationLogs / getQuickEntries / getNotices，Task 描述中提到的
 *      getUserGrowth / getOrderStats 并不存在，因此按真实 API 编写。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DashboardService } from '../dashboard.service.js';

/**
 * 构造一个 PrismaService mock
 * - 只 stub DashboardService 用到的方法（account / adminRole / adminMenu / auditLog / systemConfig）
 * - 其它方法在 service 调用时不会被访问，所以无需实现
 */
function createMockPrisma() {
    return {
        client: {
            account: {
                count: vi.fn(),
            },
            adminRole: {
                count: vi.fn(),
            },
            adminMenu: {
                count: vi.fn(),
            },
            auditLog: {
                count: vi.fn(),
                findMany: vi.fn(),
                groupBy: vi.fn(),
            },
            systemConfig: {
                findUnique: vi.fn(),
            },
        },
    };
}

describe('DashboardService', () => {
    let service: DashboardService;
    let mockPrisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
        // 每个测试前重置 mock 状态，避免上一次测试的状态泄漏
        mockPrisma = createMockPrisma();
        service = new DashboardService(mockPrisma as any);
    });

    // ── getStats ──

    describe('getStats', () => {
        it('应聚合 4 个统计卡片（管理员/角色/菜单/近 7 日操作数）', async () => {
            // 模拟 prisma 返回 4 项数据
            mockPrisma.client.account.count.mockResolvedValue(12);
            mockPrisma.client.adminRole.count.mockResolvedValue(4);
            mockPrisma.client.adminMenu.count.mockResolvedValue(36);
            mockPrisma.client.auditLog.count.mockResolvedValue(128);

            const result = await service.getStats();

            // 断言：返回 4 张卡片，数值和 label 与 mock 一致
            expect(result).toHaveLength(4);
            expect(result[0]).toEqual({ label: '管理员', value: 12, trend: 0 });
            expect(result[1]).toEqual({ label: '角色', value: 4, trend: 0 });
            expect(result[2]).toEqual({ label: '菜单项', value: 36, trend: 0 });
            expect(result[3]).toEqual({ label: '近 7 日操作数', value: 128, trend: 0 });
            // 关键断言：account 计数带 userType + deletedAt 过滤
            expect(mockPrisma.client.account.count).toHaveBeenCalledWith({
                where: { userType: 'admin', deletedAt: null },
            });
        });

        it('prisma 全部返回 0 时应降级为 value=0 的卡片（空数据兜底）', async () => {
            // 模拟全空：所有 count 都返回 0
            mockPrisma.client.account.count.mockResolvedValue(0);
            mockPrisma.client.adminRole.count.mockResolvedValue(0);
            mockPrisma.client.adminMenu.count.mockResolvedValue(0);
            mockPrisma.client.auditLog.count.mockResolvedValue(0);

            const result = await service.getStats();

            // 关键断言：兜底后 value 仍为 0，不会出现 NaN / undefined
            expect(result).toHaveLength(4);
            result.forEach((card) => {
                expect(card.value).toBe(0);
                expect(card.trend).toBe(0);
                expect(typeof card.label).toBe('string');
            });
        });
    });

    // ── getDistribution ──

    describe('getDistribution', () => {
        it('应按 action 聚合并计算百分比', async () => {
            // 模拟 3 种 action 的计数（已按 desc 排序）
            mockPrisma.client.auditLog.groupBy.mockResolvedValue([
                { action: 'login', _count: { action: 60 } },
                { action: 'create', _count: { action: 30 } },
                { action: 'update', _count: { action: 10 } },
            ]);

            const result = await service.getDistribution();

            expect(result).toHaveLength(3);
            expect(result[0]).toMatchObject({ label: 'login', percent: 60 });
            expect(result[1]).toMatchObject({ label: 'create', percent: 30 });
            expect(result[2]).toMatchObject({ label: 'update', percent: 10 });
            // 关键断言：颜色按索引循环分配
            expect(result[0].color).toBe('#1890ff');
            expect(result[1].color).toBe('#52c41a');
        });

        it('审计日志为空时应返回空数组（空数据兜底）', async () => {
            // 模拟没有任何审计日志
            mockPrisma.client.auditLog.groupBy.mockResolvedValue([]);

            const result = await service.getDistribution();

            expect(result).toEqual([]);
        });
    });

    // ── getQuickEntries ──

    describe('getQuickEntries', () => {
        it('system_config 存在且 value 是合法 JSON 字符串时应解析为数组', async () => {
            const entries = [{ title: '用户管理', route: '/users' }];
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue({
                key: 'dashboard.quickEntries',
                value: JSON.stringify(entries),
            });

            const result = await service.getQuickEntries();

            expect(result).toEqual(entries);
        });

        it('system_config 缺失时应降级为空数组（空数据兜底）', async () => {
            // 模拟未配置：findUnique 返回 null
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue(null);

            const result = await service.getQuickEntries();

            expect(result).toEqual([]);
        });

        it('value 解析后不是数组时应降级为空数组（异常兜底）', async () => {
            // 模拟 value 是 JSON 对象而非数组（非法结构）
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue({
                key: 'dashboard.quickEntries',
                value: JSON.stringify({ not: 'array' }),
            });

            const result = await service.getQuickEntries();

            expect(result).toEqual([]);
        });
    });
});
