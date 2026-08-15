import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AuditLogItem } from '@starter/api-client';
import { AUDIT_ACTION_OPTIONS, AUDIT_RESOURCE_TYPE_OPTIONS } from '@starter/api-client';
import {
  useAdminLogsQuery,
  useClearAuditLogsMutation,
  useDeleteAuditLogMutation,
  useExportAuditLogsLazyQuery,
} from '../../../generated/graphql';
import { usePermission } from '../../../app/auth/use-permission.js';
import { downloadBlob, toCSV } from '../../../shared/utils/export.js';

const { RangePicker } = DatePicker;

/** ISO 时间 → 'YYYY-MM-DD HH:mm:ss'（本地时区，无 dayjs 依赖） */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 操作类型 → 颜色映射 */
const actionColor: Record<string, string> = {
  login_success: 'green',
  login_failed: 'red',
  login_locked: 'orange',
  logout: 'default',
  password_changed: 'blue',
  account_created: 'green',
  account_updated: 'blue',
  account_deleted: 'red',
  role_created: 'green',
  role_updated: 'blue',
  role_deleted: 'red',
  menu_created: 'green',
  menu_updated: 'blue',
  menu_deleted: 'red',
  config_updated: 'purple',
  audit_cleared: 'orange',
};

/** 审计日志页（对标老项目 配置中心/审计日志）：分页列表 + 筛选 + 导出 + 清空 + 详情/删除 */
export function AuditLogsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [searchForm] = Form.useForm<{ action?: string; resourceType?: string; range?: unknown[] }>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<{
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
  }>({});
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  const [expanded, setExpanded] = useState(false);

  const canExport = usePermission('config:audit:export');
  const canClear = usePermission('config:audit:clear');
  const canDelete = usePermission('config:audit:delete');

  const { data, loading, refetch } = useAdminLogsQuery({
    variables: {
      page,
      pageSize,
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
      ...(filters.startDate ? { startDate: filters.startDate } : {}),
      ...(filters.endDate ? { endDate: filters.endDate } : {}),
    },
    fetchPolicy: 'network-only',
  });
  const [clearAuditLogs, { loading: clearing }] = useClearAuditLogsMutation();
  const [deleteAuditLog] = useDeleteAuditLogMutation();
  const [exportLogs] = useExportAuditLogsLazyQuery();

  const logs = useMemo(() => (data?.adminLogs.items ?? []) as AuditLogItem[], [data]);

  const load = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useEffect(() => {
    void load();
  }, [load, page, pageSize, filters]);

  /** 查询（筛选条件切换不自动请求，点查询才发） */
  const handleSearch = (): void => {
    const values = searchForm.getFieldsValue();
    const range = values.range as (DayjsLike | null)[] | undefined;
    setPage(1);
    setFilters({
      action: values.action || undefined,
      resourceType: values.resourceType || undefined,
      startDate: range?.[0] ? toIso(range[0]) : undefined,
      endDate: range?.[1] ? toIso(range[1]) : undefined,
    });
  };

  const handleReset = (): void => {
    searchForm.resetFields();
    setPage(1);
    setFilters({});
  };

  /** 导出 CSV（前端生成：拉全量 → BOM + 表头 → Blob） */
  const handleExport = async (): Promise<void> => {
    const res = await exportLogs({
      variables: {
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
        ...(filters.startDate ? { startDate: filters.startDate } : {}),
        ...(filters.endDate ? { endDate: filters.endDate } : {}),
      },
      fetchPolicy: 'network-only',
    });
    const items = res.data?.exportAuditLogs ?? [];
    const header = ['时间', '操作者', '操作', '资源类型', '资源ID', 'IP', '详情'];
    const rows = items.map((item) => [
      formatDateTime(item.createdAt),
      item.accountUsername ?? '系统',
      item.action,
      item.resourceType ?? '-',
      item.resourceId ?? '-',
      item.ip ?? '-',
      item.detail ?? '',
    ]);
    const ts = new Date().toISOString().slice(0, 10);
    downloadBlob(toCSV([header, ...rows]), `audit-logs-${ts}.csv`, 'text/csv;charset=utf-8;');
  };

  /** 清空日志（二次确认 → 清空 → 页码重置 1 → 重载） */
  const handleClear = async (): Promise<void> => {
    try {
      const res = await clearAuditLogs();
      const deleted = res.data?.clearAuditLogs.deletedCount ?? 0;
      void message.success(`已清空 ${deleted} 条审计日志`);
      setPage(1);
      await load();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '清空失败，请重试');
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deleteAuditLog({ variables: { id } });
      void message.success('删除成功');
      await load();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '删除失败，请重试');
    }
  };

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: '操作者',
      dataIndex: 'accountUsername',
      key: 'accountUsername',
      width: 120,
      render: (v: string | null) =>
        v ? <span>{v}</span> : <Tag color="default">系统</Tag>,
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 180,
      render: (v: string) => <Tag color={actionColor[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: '资源类型',
      dataIndex: 'resourceType',
      key: 'resourceType',
      width: 130,
      render: (v: string | null) => (v ? <Tag>{v}</Tag> : <span>-</span>),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => <span>{formatDateTime(v)}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_v, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => setDetail(record)}>
            详情
          </Button>
          {canDelete && (
            <Popconfirm title="确认删除该条审计日志？" onConfirm={() => void handleDelete(record.id)}>
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="审计日志"
      extra={
        <Space size="small">
          {canClear && (
            <Popconfirm
              title="确认清空所有审计日志？"
              description="将永久删除所有审计日志，此操作不可恢复"
              onConfirm={() => void handleClear()}
            >
              <Button color="red" variant="outlined" loading={clearing}>
                清空日志
              </Button>
            </Popconfirm>
          )}
          {canExport && <Button onClick={() => void handleExport()}>导出</Button>}
          <Button onClick={() => void load()}>刷新</Button>
        </Space>
      }
    >
      {/* 筛选区 */}
      <Form
        form={searchForm}
        layout="inline"
        style={{ marginBottom: 16, rowGap: 12 }}
        onFinish={handleSearch}
      >
        <Form.Item name="action" label="操作">
          <Select
            allowClear
            placeholder="全部操作"
            style={{ width: 200 }}
            options={AUDIT_ACTION_OPTIONS.map((a) => ({ value: a, label: a }))}
          />
        </Form.Item>
        <Form.Item name="resourceType" label="资源类型">
          <Select
            allowClear
            placeholder="全部资源"
            style={{ width: 160 }}
            options={AUDIT_RESOURCE_TYPE_OPTIONS.map((r) => ({ value: r, label: r }))}
          />
        </Form.Item>
        <Form.Item name="range" label="时间">
          <RangePicker showTime />
        </Form.Item>
        <Form.Item>
          <Space size="small">
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button onClick={handleReset}>重置</Button>
            <Button type="link" size="small" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? '收起' : '展开'}
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Table<AuditLogItem>
        rowKey="id"
        columns={columns}
        dataSource={logs}
        loading={loading}
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize,
          total: data?.adminLogs.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* 详情 Modal */}
      <Modal
        title="审计日志详情"
        open={detail !== null}
        onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detail && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px' }}>
            <span style={{ color: 'rgba(0,0,0,0.45)' }}>时间</span>
            <span>{formatDateTime(detail.createdAt)}</span>
            <span style={{ color: 'rgba(0,0,0,0.45)' }}>操作者</span>
            <span>{detail.accountUsername ?? '系统'}</span>
            <span style={{ color: 'rgba(0,0,0,0.45)' }}>操作</span>
            <Tag color={actionColor[detail.action] ?? 'default'}>{detail.action}</Tag>
            <span style={{ color: 'rgba(0,0,0,0.45)' }}>资源类型</span>
            <span>{detail.resourceType ?? '-'}</span>
            {detail.resourceId && (
              <>
                <span style={{ color: 'rgba(0,0,0,0.45)' }}>资源 ID</span>
                <span>{detail.resourceId}</span>
              </>
            )}
            {detail.ip && (
              <>
                <span style={{ color: 'rgba(0,0,0,0.45)' }}>IP</span>
                <span>{detail.ip}</span>
              </>
            )}
            {detail.detail && (
              <>
                <span style={{ color: 'rgba(0,0,0,0.45)' }}>详情</span>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    background: 'rgba(0,0,0,0.03)',
                    padding: 8,
                    borderRadius: 4,
                    fontSize: 12,
                    maxHeight: 240,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(JSON.parse(detail.detail), null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}

/** RangePicker 值的 Date 兼容接口（避免直接依赖 dayjs 类型） */
interface DayjsLike {
  toISOString?: () => string;
  format?: (fmt: string) => string;
  toDate?: () => Date;
}

function toIso(value: DayjsLike): string {
  if (typeof value.toISOString === 'function') return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.format === 'function') return new Date(value.format('YYYY-MM-DDTHH:mm:ss')).toISOString();
  return new Date().toISOString();
}
