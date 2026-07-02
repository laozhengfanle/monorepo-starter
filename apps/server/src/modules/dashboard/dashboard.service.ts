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

    /** 统计卡片：管理员数、角色数、菜单数、近 7 日操作数（含较上周趋势） */
    async getStats(): Promise<{ label: string; value: number; trend: number }[]> {
        const now = Date.now();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

        const [userCount, userCountPrev, roleCount, roleCountPrev, menuCount, menuCountPrev, opsCount, opsCountPrev] =
            await Promise.all([
                // 本周：当前管理员数（未被删除的 admin）
                this.prisma.client.account.count({ where: { userType: 'admin', deletedAt: null } }),
                // 上周：7 天前已创建且未被删除的管理员数
                this.prisma.client.account.count({
                    where: { userType: 'admin', deletedAt: null, createdAt: { lte: sevenDaysAgo } },
                }),
                // 本周：当前角色数
                this.prisma.client.adminRole.count(),
                // 上周：7 天前已创建的角色数
                this.prisma.client.adminRole.count({ where: { createdAt: { lte: sevenDaysAgo } } }),
                // 本周：当前菜单数
                this.prisma.client.adminMenu.count(),
                // 上周：7 天前已创建的菜单数
                this.prisma.client.adminMenu.count({ where: { createdAt: { lte: sevenDaysAgo } } }),
                // 本周：近 7 天操作数
                this.prisma.client.auditLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
                // 上周：前 7 天操作数（14 天前 ~ 7 天前）
                this.prisma.client.auditLog.count({
                    where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
                }),
            ]);

        return [
            { label: '管理员', value: userCount, trend: this.calcTrend(userCount, userCountPrev) },
            { label: '角色', value: roleCount, trend: this.calcTrend(roleCount, roleCountPrev) },
            { label: '菜单项', value: menuCount, trend: this.calcTrend(menuCount, menuCountPrev) },
            { label: '近 7 日操作数', value: opsCount, trend: this.calcTrend(opsCount, opsCountPrev) },
        ];
    }

    /** 计算较上周趋势百分比，上周为 0 时从无到有视为 100% 增长 */
    private calcTrend(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    }

    /** 审计日志 action → 中文映射 */
    private readonly ACTION_LABELS: Record<string, string> = {
        login_success: '登录成功',
        login_failed: '登录失败',
        login_locked: '登录锁定',
        account_unlocked: '账户解锁',
        account_updated: '账户更新',
        account_created: '账户创建',
        account_deleted: '账户删除',
        role_granted: '角色授权',
        role_revoked: '权限回收',
        config_updated: '配置变更',
    };

    /** 趋势数据：审计日志按周/月/年聚合 */
    async getTrend(range: string): Promise<{ label: string; highRisk: number; midRisk: number; lowRisk: number }[]> {
        const now = new Date();

        if (range === 'year') {
            // 本年：1-12 月
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const buckets: Record<string, { highRisk: number; midRisk: number; lowRisk: number }> = {};
            for (let m = 0; m < 12; m++) {
                buckets[`${m + 1}月`] = { highRisk: 0, midRisk: 0, lowRisk: 0 };
            }

            const logs = await this.prisma.client.auditLog.findMany({
                where: { createdAt: { gte: startOfYear } },
                select: { action: true, createdAt: true },
            });

            for (const log of logs) {
                const m = log.createdAt.getMonth();
                this.classifyRisk(log.action, buckets[`${m + 1}月`]);
            }

            return Object.entries(buckets).map(([label, v]) => ({ label, ...v }));
        }

        if (range === 'month') {
            // 本月：1 日 ~ 今天
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const daysInMonth = now.getDate();
            const buckets: Record<string, { highRisk: number; midRisk: number; lowRisk: number }> = {};
            for (let d = 1; d <= daysInMonth; d++) {
                buckets[`${now.getMonth() + 1}/${d}`] = { highRisk: 0, midRisk: 0, lowRisk: 0 };
            }

            const logs = await this.prisma.client.auditLog.findMany({
                where: { createdAt: { gte: firstDay } },
                select: { action: true, createdAt: true },
            });

            for (const log of logs) {
                const key = `${log.createdAt.getMonth() + 1}/${log.createdAt.getDate()}`;
                if (buckets[key]) {
                    this.classifyRisk(log.action, buckets[key]);
                }
            }

            return Object.entries(buckets).map(([label, v]) => ({ label, ...v }));
        }

        // 本周：周一 ~ 周日
        const dow = (now.getDay() + 6) % 7; // 周一=0
        const monday = new Date(now);
        monday.setDate(now.getDate() - dow);
        monday.setHours(0, 0, 0, 0);

        const buckets: Record<string, { highRisk: number; midRisk: number; lowRisk: number }> = {};
        for (let d = 0; d < 7; d++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + d);
            buckets[`${day.getMonth() + 1}/${day.getDate()}`] = { highRisk: 0, midRisk: 0, lowRisk: 0 };
        }

        const logs = await this.prisma.client.auditLog.findMany({
            where: { createdAt: { gte: monday } },
            select: { action: true, createdAt: true },
        });

        for (const log of logs) {
            const key = `${log.createdAt.getMonth() + 1}/${log.createdAt.getDate()}`;
            if (buckets[key]) {
                this.classifyRisk(log.action, buckets[key]);
            }
        }

        return Object.entries(buckets).map(([label, v]) => ({ label, ...v }));
    }

    /** 根据 action 将审计日志归入风险等级 */
    private classifyRisk(action: string, bucket: { highRisk: number; midRisk: number; lowRisk: number }): void {
        const highRiskActions = ['login_locked', 'account_deleted'];
        const midRiskActions = [
            'login_failed',
            'account_updated',
            'account_created',
            'role_granted',
            'role_revoked',
            'config_updated',
        ];
        if (highRiskActions.includes(action)) {
            bucket.highRisk++;
        } else if (midRiskActions.includes(action)) {
            bucket.midRisk++;
        } else {
            bucket.lowRisk++;
        }
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
            label: this.ACTION_LABELS[l.action] || l.action,
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
