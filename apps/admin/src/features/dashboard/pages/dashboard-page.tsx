import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Empty,
  Row,
  Segmented,
  Statistic,
  Table,
  Tag,
  theme,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  DesktopOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { AdminMenuNode } from '@starter/api-client';
import { useAuth } from '../../../app/auth/auth-context.js';
import { usePermission } from '../../../app/auth/use-permission.js';
import { getMenuIcon } from '../../../shared/utils/menu-icons.js';
import {
  useDashboardDistributionQuery,
  useDashboardOperationLogsQuery,
  useDashboardStatsQuery,
  useDashboardTrendQuery,
} from '../../../generated/graphql';
import {
  EChart,
  type EChartsCoreOption,
} from '../../../shared/components/echart';

/** 风险等级颜色（沿用 antd 色板） */
const RISK_COLORS = {
  high: '#d03050',
  mid: '#f0a020',
  low: '#2080f0',
} as const;

/** 操作类型 → 标签/颜色 */
const OP_TYPE_META: Record<string, { label: string; color: string }> = {
  login: { label: '登录', color: 'blue' },
  logout: { label: '登出', color: 'default' },
  create: { label: '新增', color: 'green' },
  update: { label: '修改', color: 'gold' },
  delete: { label: '删除', color: 'red' },
  reset: { label: '重置', color: 'red' },
  export: { label: '导出', color: 'blue' },
  import: { label: '导入', color: 'cyan' },
  grant: { label: '授权', color: 'purple' },
  approve: { label: '审批', color: 'green' },
};

interface OpLogRow {
  seq: number;
  user: string;
  content: string;
  module: string;
  type: string;
  ip: string;
  time: string;
}

/** 菜单图标名 → antd 图标（统一走 shared/utils/menu-icons.ts 单一来源） */
function resolveMenuIcon(name?: string | null): React.ReactNode {
  return getMenuIcon(name) ?? <ScheduleOutlined />;
}

/** 递归收集菜单树中所有可跳转的 menu 节点（顶层是 directory，menu 在 children 里） */
function collectMenuNodes(
  nodes: AdminMenuNode[],
  out: { title: string; desc: string; icon: React.ReactNode; route: string }[],
): void {
  for (const node of nodes) {
    if (node.type === 'menu' && node.path) {
      out.push({
        title: node.name,
        desc: node.path,
        icon: resolveMenuIcon(node.icon),
        route: node.path,
      });
    }
    if (node.children?.length) {
      collectMenuNodes(node.children, out);
    }
  }
}

/** 从 me.menus 派生快捷入口（递归取有 path 的 menu 节点，跟随权限裁剪） */
function useQuickEntries(): {
  title: string;
  desc: string;
  icon: React.ReactNode;
  route: string;
}[] {
  const { user } = useAuth();
  return useMemo(() => {
    const entries: {
      title: string;
      desc: string;
      icon: React.ReactNode;
      route: string;
    }[] = [];
    collectMenuNodes(user?.menus ?? [], entries);
    return entries.slice(0, 6);
  }, [user]);
}

/** 浏览器/系统信息（纯前端 navigator 探测） */
function useSystemInfo(): {
  os: string;
  browser: string;
  resolution: string;
  timezone: string;
} {
  return useMemo(() => {
    const ua = navigator.userAgent;
    let os = '未知系统';
    if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad/.test(ua)) os = 'iOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    let browser = '未知浏览器';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    return {
      os,
      browser,
      resolution: `${window.screen.width} × ${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }, []);
}

/** 仪表盘：欢迎英雄卡 + 统计卡片 + 敏感操作趋势 + 分布 + 操作记录 + 快捷入口 + 系统环境 */
export function DashboardPage(): React.JSX.Element {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canAudit = usePermission('config:audit:view');
  const quickEntries = useQuickEntries();
  const systemInfo = useSystemInfo();

  // 各数据区独立请求，先到先渲染
  const { data: statsData } = useDashboardStatsQuery();
  const [range, setRange] = useState<'week' | 'month' | 'year'>('week');
  const { data: trendData, loading: trendLoading } = useDashboardTrendQuery({
    variables: { range },
  });
  const { data: distData } = useDashboardDistributionQuery({ skip: !canAudit });
  const {
    data: opData,
    loading: opLoading,
    refetch,
  } = useDashboardOperationLogsQuery({
    variables: { page: 1, pageSize: 10 },
    skip: !canAudit,
  });

  // ── 欢迎英雄卡 ──
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 6
      ? '夜深了'
      : hour < 9
        ? '早上好'
        : hour < 12
          ? '上午好'
          : hour < 14
            ? '中午好'
            : hour < 18
              ? '下午好'
              : '晚上好';
  const weekday = [
    '星期日',
    '星期一',
    '星期二',
    '星期三',
    '星期四',
    '星期五',
    '星期六',
  ][now.getDay()];
  const roleLabel = user?.roleCodes.includes('super_admin')
    ? '超级管理员'
    : (user?.roleCodes ?? []).join('、') || '管理员';

  // ── 统计卡片（含较上周趋势） ──
  const stats = statsData?.dashboardStats ?? [];
  const statIcons = [
    <TeamOutlined key="a" />,
    <SafetyCertificateOutlined key="r" />,
    <ScheduleOutlined key="m" />,
    <BarChartOutlined key="o" />,
  ];
  const statColors = ['#2080f0', '#18a058', '#f0a020', '#722ed1'];

  // ── 趋势折线图 ──
  const trendItems = trendData?.dashboardTrend ?? [];
  const trendOption = useMemo<EChartsCoreOption>(() => {
    const items = trendData?.dashboardTrend ?? [];
    const labels = items.map((d) => d.label);
    return {
      animationDuration: 400,
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
      grid: { top: 16, right: 16, bottom: 40, left: 36 },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#9ca3af', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: 'rgba(156,163,175,0.15)' } },
        axisLabel: { color: '#9ca3af', fontSize: 10 },
      },
      series: [
        {
          name: '高危',
          type: 'line',
          smooth: 0.4,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: {
            color: '#fff',
            borderColor: RISK_COLORS.high,
            borderWidth: 1.5,
          },
          lineStyle: { color: RISK_COLORS.high, width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(208,48,80,0.30)' },
                { offset: 1, color: 'rgba(208,48,80,0.02)' },
              ],
            },
          },
          data: items.map((d) => d.highRisk),
        },
        {
          name: '中危',
          type: 'line',
          smooth: 0.4,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: {
            color: '#fff',
            borderColor: RISK_COLORS.mid,
            borderWidth: 1.5,
          },
          lineStyle: { color: RISK_COLORS.mid, width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(240,160,32,0.25)' },
                { offset: 1, color: 'rgba(240,160,32,0.02)' },
              ],
            },
          },
          data: items.map((d) => d.midRisk),
        },
        {
          name: '低危',
          type: 'line',
          smooth: 0.4,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: {
            color: '#fff',
            borderColor: RISK_COLORS.low,
            borderWidth: 1.5,
          },
          lineStyle: { color: RISK_COLORS.low, width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(32,128,240,0.22)' },
                { offset: 1, color: 'rgba(32,128,240,0.02)' },
              ],
            },
          },
          data: items.map((d) => d.lowRisk),
        },
      ],
    };
  }, [trendData?.dashboardTrend]);

  // ── 分布饼图 ──
  const distItems = distData?.dashboardDistribution ?? [];
  const distOption = useMemo<EChartsCoreOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        formatter: '{b}<br/>占比: {d}%',
      },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
      series: [
        {
          name: '操作类型',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '42%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}\n{d}%',
            fontSize: 11,
          },
          labelLine: { length: 8, length2: 8 },
          data: (distData?.dashboardDistribution ?? []).map((d) => ({
            name: d.label,
            value: d.percent,
            itemStyle: { color: d.color },
          })),
        },
      ],
    }),
    [distData?.dashboardDistribution],
  );

  // ── 操作记录表格 ──
  const opRows: OpLogRow[] = (opData?.dashboardOperationLogs.list ?? []).map(
    (r) => ({
      seq: r.seq,
      user: r.user,
      content: r.content,
      module: r.module,
      type: r.type,
      ip: r.ip,
      time: r.time,
    }),
  );
  const opColumns: ColumnsType<OpLogRow> = [
    { title: '#', dataIndex: 'seq', width: 50 },
    { title: '操作者', dataIndex: 'user', width: 120 },
    {
      title: '操作内容',
      dataIndex: 'content',
      width: 140,
      render: (v: string) => <Tag variant="filled">{v}</Tag>,
    },
    {
      title: '模块',
      dataIndex: 'module',
      width: 120,
      render: (v: string) => (
        <Tag color="blue" variant="filled">
          {v}
        </Tag>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (v: string) => {
        const meta = OP_TYPE_META[v] ?? { label: v, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 130,
      render: (v: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {v || '—'}
        </span>
      ),
    },
    { title: '时间', dataIndex: 'time', width: 170 },
  ];

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: token.marginMD }}
    >
      {/* ── 欢迎英雄卡 ── */}
      <Card
        variant="borderless"
        styles={{ body: { padding: token.paddingLG } }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: token.marginMD,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: token.marginMD,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${token.colorPrimary}, #722ed1)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 24,
                flexShrink: 0,
              }}
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt="avatar"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <UserOutlined />
              )}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.4 }}>
                {greeting}，{user?.nickname || user?.username || '管理员'}
              </div>
              <div
                style={{
                  marginTop: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: token.colorSuccess }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: token.colorSuccess,
                      marginRight: 6,
                    }}
                  />
                  系统运行正常
                </span>
                <Tag color="blue" variant="filled">
                  {roleLabel}
                </Tag>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                lineHeight: 1,
                color: token.colorText,
              }}
            >
              {now.getDate()}
            </div>
            <div style={{ color: token.colorTextSecondary, marginTop: 4 }}>
              {now.getFullYear()} 年 {now.getMonth() + 1} 月 · {weekday}
            </div>
          </div>
        </div>
      </Card>

      {/* ── 统计卡片 ── */}
      <Row gutter={[token.marginMD, token.marginMD]}>
        {stats.map((s, i) => (
          <Col xs={12} lg={6} key={s.label}>
            <Card
              variant="borderless"
              styles={{ body: { padding: token.paddingLG } }}
            >
              <Statistic
                title={s.label}
                value={s.value}
                prefix={
                  <span style={{ color: statColors[i] }}>{statIcons[i]}</span>
                }
                suffix={
                  <span
                    style={{
                      fontSize: 12,
                      marginLeft: 8,
                      color: s.trend > 0 ? '#d03050' : '#18a058',
                    }}
                  >
                    {s.trend > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{' '}
                    {Math.abs(s.trend)}%
                    <span
                      style={{ color: token.colorTextTertiary, marginLeft: 4 }}
                    >
                      较上周
                    </span>
                  </span>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── 图表区（仅 audit 权限可见） ── */}
      {canAudit && (
        <Row gutter={[token.marginMD, token.marginMD]}>
          <Col xs={24} lg={16}>
            <Card
              variant="borderless"
              title="敏感操作趋势"
              extra={
                <Segmented
                  value={range}
                  onChange={(v) => setRange(v as 'week' | 'month' | 'year')}
                  options={[
                    { label: '本周', value: 'week' },
                    { label: '本月', value: 'month' },
                    { label: '本年', value: 'year' },
                  ]}
                />
              }
            >
              {trendItems.length === 0 && !trendLoading ? (
                <Empty
                  description="暂无数据"
                  styles={{ image: { height: 80 } }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    height: 300,
                  }}
                />
              ) : (
                <EChart option={trendOption} height={300} />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card variant="borderless" title="操作类型分布">
              {distItems.length === 0 ? (
                <Empty
                  description="暂无数据"
                  styles={{ image: { height: 80 } }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    height: 300,
                  }}
                />
              ) : (
                <EChart option={distOption} height={300} />
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* ── 操作记录（仅 audit 权限可见） ── */}
      {canAudit && (
        <Card
          variant="borderless"
          title="最近操作记录"
          extra={
            <Button type="link" size="small" onClick={() => void refetch()}>
              刷新
            </Button>
          }
        >
          <Table<OpLogRow>
            rowKey="seq"
            columns={opColumns}
            dataSource={opRows}
            loading={opLoading}
            size="small"
            pagination={{
              total: opData?.dashboardOperationLogs.total ?? 0,
              pageSize: 10,
              showSizeChanger: false,
              onChange: (p) => void refetch({ page: p, pageSize: 10 }),
            }}
          />
        </Card>
      )}

      {/* ── 快捷入口 + 系统环境（Grid 等高） ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 58fr) minmax(280px, 42fr)',
          gap: token.marginMD,
        }}
      >
        <Card variant="borderless" title="快捷入口" style={{ height: '100%' }}>
          <Row gutter={[token.marginSM, token.marginSM]}>
            {quickEntries.map((e) => (
              <Col xs={12} sm={8} key={e.route}>
                <button
                  type="button"
                  aria-label={`进入 ${e.title}`}
                  onClick={() => navigate(e.route)}
                  style={{
                    width: '100%',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                  }}
                >
                  <Card
                    hoverable
                    variant="borderless"
                    styles={{ body: { padding: token.paddingSM } }}
                    style={{ background: token.colorFillTertiary }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: token.colorPrimaryBg,
                          color: token.colorPrimary,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          flexShrink: 0,
                        }}
                      >
                        {e.icon}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {e.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: token.colorTextTertiary,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {e.desc}
                        </div>
                      </div>
                    </div>
                  </Card>
                </button>
              </Col>
            ))}
          </Row>
        </Card>
        <Card variant="borderless" title="系统环境" style={{ height: '100%' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: token.marginSM,
            }}
          >
            {[
              {
                label: '操作系统',
                value: systemInfo.os,
                icon: <DesktopOutlined />,
              },
              {
                label: '浏览器',
                value: systemInfo.browser,
                icon: <GlobalOutlined />,
              },
              {
                label: '屏幕分辨率',
                value: systemInfo.resolution,
                icon: <BarChartOutlined />,
              },
              {
                label: '时区',
                value: systemInfo.timezone,
                icon: <ScheduleOutlined />,
              },
            ].map((info) => (
              <div
                key={info.label}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: token.colorFillTertiary,
                    color: token.colorTextSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {info.icon}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                    {info.label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {info.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
