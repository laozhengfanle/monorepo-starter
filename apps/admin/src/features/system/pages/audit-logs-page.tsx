import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Modal, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AuditLogItem } from '@starter/api-client';
import { SearchBar, type SearchValues } from '@starter/ui';
import {
  useAdminLogsQuery,
  useClearAuditLogsMutation,
  useDeleteAuditLogMutation,
  useExportAuditLogsLazyQuery,
  useSysDictTypesQuery,
} from '../../../generated/graphql';
import { usePermission } from '../../../app/auth/use-permission.js';
import { downloadBlob, toCSV } from '../../../shared/utils/export.js';
import { TableToolbar } from '../../../shared/components/table-toolbar.js';
import { useColumnControl } from '../../../shared/hooks/use-column-control.js';
import { safeParseJson } from '../../../shared/utils/json.js';

/** 字典类型编码（审计操作 / 审计资源类型） */
const DICT_ACTION = 'audit_action';
const DICT_RESOURCE = 'audit_resource';

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
  token_refreshed: 'cyan',
  token_reused: 'red',
  account_created: 'green',
  account_updated: 'blue',
  account_enabled: 'green',
  account_disabled: 'orange',
  account_deleted: 'red',
  account_restored: 'green',
  account_hard_deleted: 'red',
  role_assigned: 'green',
  role_revoked: 'orange',
  account_permission_changed: 'purple',
  role_created: 'green',
  role_updated: 'blue',
  role_deleted: 'red',
  permission_changed: 'purple',
  menu_created: 'green',
  menu_updated: 'blue',
  menu_deleted: 'red',
  file_uploaded: 'cyan',
  file_deleted: 'red',
  config_updated: 'purple',
  audit_cleared: 'orange',
  dict_created: 'green',
  dict_updated: 'blue',
  dict_deleted: 'red',
};

/** 审计日志页（对标老项目 配置中心/审计日志）：分页列表 + 筛选 + 导出 + 清空 + 详情/删除 */
export function AuditLogsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<{
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
  }>({});
  const [detail, setDetail] = useState<AuditLogItem | null>(null);

  const canExport = usePermission('config:audit:export');
  const canClear = usePermission('config:audit:clear');
  const canDelete = usePermission('config:audit:delete');

  const { data, loading, refetch } = useAdminLogsQuery({
    variables: {
      query: {
        page,
        pageSize,
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
        ...(filters.startDate ? { startDate: filters.startDate } : {}),
        ...(filters.endDate ? { endDate: filters.endDate } : {}),
      },
    },
    fetchPolicy: 'network-only',
  });
  const [clearAuditLogs, { loading: clearing }] = useClearAuditLogsMutation();
  const [deleteAuditLog] = useDeleteAuditLogMutation();
  const [exportLogs] = useExportAuditLogsLazyQuery();

  // 筛选下拉选项来自数据字典（audit_action / audit_resource，字典管理页可维护）
  const { data: dictData } = useSysDictTypesQuery();
  const dictOptions = useMemo(() => {
    const types = (dictData?.sysDictTypes ?? []) as {
      code: string;
      items: { label: string; value: string }[];
    }[];
    const find = (code: string) => {
      const t = types.find((x) => x.code === code);
      return (t?.items ?? []).map((i) => ({ value: i.value, label: i.label }));
    };
    return { actions: find(DICT_ACTION), resources: find(DICT_RESOURCE) };
  }, [dictData]);
  // value → label 映射（操作列/详情显示中文标签）
  const actionLabelMap = useMemo(
    () => new Map(dictOptions.actions.map((o) => [o.value, o.label])),
    [dictOptions],
  );
  const resourceLabelMap = useMemo(
    () => new Map(dictOptions.resources.map((o) => [o.value, o.label])),
    [dictOptions],
  );
  const actionLabel = (v: string): string => actionLabelMap.get(v) ?? v;
  const resourceLabel = (v: string): string => resourceLabelMap.get(v) ?? v;

  const logs = useMemo(
    () => (data?.adminLogs.items ?? []) as AuditLogItem[],
    [data],
  );

  const load = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useEffect(() => {
    void load();
  }, [load, page, pageSize, filters]);

  /** 查询（SearchBar onSearch：点击查询才发请求） */
  const handleSearch = (values: SearchValues): void => {
    const range = values.range as (DayjsLike | null)[] | undefined;
    setPage(1);
    setFilters({
      action: (values.action as string | undefined) || undefined,
      resourceType: (values.resourceType as string | undefined) || undefined,
      startDate: range?.[0] ? toIso(range[0]) : undefined,
      endDate: range?.[1] ? toIso(range[1]) : undefined,
    });
  };

  /** 重置（SearchBar 已 resetFields，这里清空状态 + 回第一页） */
  const handleReset = (): void => {
    setPage(1);
    setFilters({});
  };

  /** 导出 CSV（前端生成：拉全量 → BOM + 表头 → Blob） */
  const handleExport = async (): Promise<void> => {
    const res = await exportLogs({
      variables: {
        query: {
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.resourceType
            ? { resourceType: filters.resourceType }
            : {}),
          ...(filters.startDate ? { startDate: filters.startDate } : {}),
          ...(filters.endDate ? { endDate: filters.endDate } : {}),
        },
      },
      fetchPolicy: 'network-only',
    });
    const items = res.data?.exportAuditLogs ?? [];
    const header = ['操作者', '时间', '操作', '资源类型', '资源ID', 'IP'];
    const rows = items.map((item) => [
      item.accountUsername ?? '系统',
      formatDateTime(item.createdAt),
      item.action,
      item.resourceType ?? '-',
      item.resourceId ?? '-',
      item.ip ?? '-',
    ]);
    const ts = new Date().toISOString().slice(0, 10);
    downloadBlob(
      toCSV([header, ...rows]),
      `audit-logs-${ts}.csv`,
      'text/csv;charset=utf-8;',
    );
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
      void message.error(
        error instanceof Error ? error.message : '清空失败，请重试',
      );
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deleteAuditLog({ variables: { id } });
      void message.success('删除成功');
      await load();
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : '删除失败，请重试',
      );
    }
  };

  const fullColumns: ColumnsType<AuditLogItem> = [
    {
      title: '操作者',
      dataIndex: 'accountUsername',
      key: 'accountUsername',
      width: 110,
      render: (v: string | null) =>
        v ? <span>{v}</span> : <Tag color="default">系统</Tag>,
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
      dataIndex: 'action',
      key: 'action',
      width: 180,
      render: (v: string) => (
        <Tag color={actionColor[v] ?? 'default'}>{actionLabel(v)}</Tag>
      ),
    },
    {
      title: '资源类型',
      dataIndex: 'resourceType',
      key: 'resourceType',
      width: 150,
      render: (v: string | null) =>
        v ? <Tag>{resourceLabel(v)}</Tag> : <span>-</span>,
    },
    {
      title: '资源ID',
      dataIndex: 'resourceId',
      key: 'resourceId',
      width: 200,
      ellipsis: true,
      render: (v: string | null) => (v ? <span>{v}</span> : <span>-</span>),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (v: string | null) => (v ? <span>{v}</span> : <span>-</span>),
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
            <Popconfirm
              title="确认删除该条审计日志？"
              onConfirm={() => void handleDelete(record.id)}
            >
              <Button color="danger" variant="link" size="small">
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // 列控制（三要素：列控制 / 导出 / 刷新；导出仍走服务端全量 exportAuditLogs）
  const { columnMenuItems, columns } = useColumnControl<AuditLogItem>({
    fullColumns,
    initialVisibleKeys: [
      'accountUsername',
      'createdAt',
      'action',
      'resourceType',
      'resourceId',
      'ip',
      'actions',
    ],
  });

  return (
    <div>
      {/* 搜索卡：独立 Card 位于列表正上方（列表页规范） */}
      <SearchBar
        fields={[
          {
            name: 'action',
            label: '操作',
            type: 'select',
            placeholder: '全部操作',
            options: dictOptions.actions,
          },
          {
            name: 'resourceType',
            label: '资源类型',
            type: 'select',
            placeholder: '全部资源',
            options: dictOptions.resources,
          },
          { name: 'range', label: '时间', type: 'dateRange' },
        ]}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      <Card
        title="审计日志"
        extra={
          <TableToolbar
            columnMenuItems={columnMenuItems}
            exportFormats={['csv']}
            onExport={canExport ? () => void handleExport() : undefined}
            onRefresh={() => void load()}
            extra={
              canClear && (
                <Popconfirm
                  title="确认清空所有审计日志？"
                  description="将永久删除所有审计日志，此操作不可恢复"
                  onConfirm={() => void handleClear()}
                >
                  <Button color="red" variant="outlined" loading={clearing}>
                    清空日志
                  </Button>
                </Popconfirm>
              )
            }
          />
        }
      >
        <Table<AuditLogItem>
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          scroll={{ x: 1100 }}
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '8px 16px',
              }}
            >
              <span style={{ color: 'rgba(0,0,0,0.45)' }}>时间</span>
              <span>{formatDateTime(detail.createdAt)}</span>
              <span style={{ color: 'rgba(0,0,0,0.45)' }}>操作者</span>
              <span>{detail.accountUsername ?? '系统'}</span>
              <span style={{ color: 'rgba(0,0,0,0.45)' }}>操作</span>
              <Tag color={actionColor[detail.action] ?? 'default'}>
                {actionLabel(detail.action)}
              </Tag>
              <span style={{ color: 'rgba(0,0,0,0.45)' }}>资源类型</span>
              <span>
                {detail.resourceType ? resourceLabel(detail.resourceType) : '-'}
              </span>
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
                  {/* 脏数据兜底：JSON.parse 失败时按纯文本展示原始字符串，避免白屏 */}
                  <DetailContent raw={detail.detail} />
                </>
              )}
            </div>
          )}
        </Modal>
      </Card>
    </div>
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
  if (typeof value.format === 'function')
    return new Date(value.format('YYYY-MM-DDTHH:mm:ss')).toISOString();
  return new Date().toISOString();
}

/** 审计详情展示：JSON 格式化；解析失败（脏数据）时按纯文本展示原始字符串 */
function DetailContent({ raw }: { raw: string }): React.JSX.Element {
  const parsed = safeParseJson(raw);
  const text =
    typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
  return (
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
      {text}
    </pre>
  );
}
