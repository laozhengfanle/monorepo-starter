/**
 * Dashboard 数据服务
 *
 * 数据来源：
 * - 统计卡片：admin_account / admin_role / admin_menu 计数
 * - 趋势 & 分布：audit_log 聚合
 * - 快捷入口 & 公告：system_config（key=dashboard.quickEntries / dashboard.notices）
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) {}

    /** 统计卡片：管理员数、角色数、菜单数、近 7 日操作数 */
    async getStats(): Promise<{ label: string; value: number; trend: number }[]> {
        const [userCount, roleCount, menuCount, opsCount] = await Promise.all([
            this.prisma.client.account.count({ where: { userType: 'admin', deletedAt: null } }),
            this.prisma.client.adminRole.count({}),
            this.prisma.client.adminMenu.count(),
            this.prisma.client.auditLog.count({
                where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            }),
        ]);
        return [
            { label: '管理员', value: userCount, trend: 0 },
            { label: '角色', value: roleCount, trend: 0 },
            { label: '菜单项', value: menuCount, trend: 0 },
            { label: '近 7 日操作数', value: opsCount, trend: 0 },
        ];
    }

    /** 趋势数据：审计日志按周/月/年聚合 */
    async getTrend(range: string): Promise<{ label: string; highRisk: number; midRisk: number; lowRisk: number }[]> {
        // 简化实现：按天聚合最近的数据
        const days = range === 'year' ? 12 : range === 'month' ? 30 : 7;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const logs = await this.prisma.client.auditLog.findMany({
            where: { createdAt: { gte: since } },
            select: { action: true, createdAt: true },
        });

        // 按天分桶
        const buckets: Record<string, { highRisk: number; midRisk: number; lowRisk: number }> = {};
        for (let i = 0; i < days; i++) {
            const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            buckets[key] = { highRisk: 0, midRisk: 0, lowRisk: 0 };
        }

        for (const log of logs) {
            const d = new Date(log.createdAt);
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            if (buckets[key]) {
                if (log.action.includes('delete') || log.action.includes('reset')) {
                    buckets[key].highRisk++;
                } else if (log.action.includes('update') || log.action.includes('create')) {
                    buckets[key].midRisk++;
                } else {
                    buckets[key].lowRisk++;
                }
            }
        }

        return Object.entries(buckets).map(([label, v]) => ({ label, ...v }));
    }

    /** 分布数据：按 action 类型聚合 */
    async getDistribution(): Promise<{ label: string; percent: number; color: string }[]> {
        const logs = await this.prisma.client.auditLog.groupBy({
            by: ['action'],
            _count: { action: true },
            orderBy: { _count: { action: 'desc' } },
            take: 6,
        });

        const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
        const total = logs.reduce((sum, l) => sum + l._count.action, 0);

        return logs.map((l, i) => ({
            label: l.action,
            percent: total > 0 ? Math.round((l._count.action / total) * 100) : 0,
            color: colors[i % colors.length],
        }));
    }

    /** 操作日志分页 */
    async getOperationLogs(page: number, pageSize: number) {
        const skip = (page - 1) * pageSize;
        const [total, items] = await Promise.all([
            this.prisma.client.auditLog.count(),
            this.prisma.client.auditLog.findMany({
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
                include: {
                    account: {
                        include: { adminProfile: true },
                    },
                },
            }),
        ]);

        const list = items.map((item) => ({
            id: item.id,
            user: item.account?.adminProfile?.nickname || '未知用户',
            title: item.account?.adminProfile?.nickname ? '管理员' : '',
            avatar: '',
            titleColor: 'default' as const,
            content: item.action,
            type: item.action.includes('login')
                ? 'login'
                : item.action.includes('delete')
                  ? 'delete'
                  : item.action.includes('create')
                    ? 'create'
                    : item.action.includes('update')
                      ? 'update'
                      : item.action.includes('grant')
                        ? 'grant'
                        : item.action.includes('export')
                          ? 'export'
                          : item.action.includes('import')
                            ? 'import'
                            : 'approve',
            module: item.resourceType || '系统',
            ip: item.ip || '',
            time: item.createdAt
                ? `${item.createdAt.getFullYear()}-${String(item.createdAt.getMonth() + 1).padStart(2, '0')}-${String(item.createdAt.getDate()).padStart(2, '0')} ${String(item.createdAt.getHours()).padStart(2, '0')}:${String(item.createdAt.getMinutes()).padStart(2, '0')}:${String(item.createdAt.getSeconds()).padStart(2, '0')}`
                : '',
        }));

        return { list, total, page, pageSize };
    }

    /** 快捷入口 — 从 system_config 读取 */
    async getQuickEntries(): Promise<Record<string, unknown>[]> {
        try {
            const cfg = await this.prisma.client.systemConfig.findUnique({
                where: { key: 'dashboard.quickEntries' },
            });
            if (cfg?.value) {
                const parsed = typeof cfg.value === 'string' ? JSON.parse(cfg.value) : cfg.value;
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch {
            /* fallthrough */
        }
        return [];
    }

    /** 系统公告 — 从 system_config 读取 */
    async getNotices(): Promise<Record<string, unknown>[]> {
        try {
            const cfg = await this.prisma.client.systemConfig.findUnique({
                where: { key: 'dashboard.notices' },
            });
            if (cfg?.value) {
                const parsed = typeof cfg.value === 'string' ? JSON.parse(cfg.value) : cfg.value;
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch {
            /* fallthrough */
        }
        return [];
    }
}
