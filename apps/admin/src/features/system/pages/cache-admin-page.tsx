import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CacheKey } from '@starter/api-client';
import {
  useCacheKeyLazyQuery,
  useCacheKeysQuery,
  useCacheKeyTotalQuery,
  useCacheStatsQuery,
  useClearCacheByPatternMutation,
  useDeleteCacheKeyMutation,
  useDeleteCacheKeysMutation,
} from '../../../generated/graphql';
import { usePermission } from '../../../app/auth/use-permission.js';

const { Text } = Typography;

/** Redis 类型 → 颜色映射 */
const typeColor: Record<string, string> = {
  string: 'default',
  hash: 'blue',
  list: 'green',
  set: 'orange',
  zset: 'red',
  stream: 'red',
};

/** TTL 格式化：-1 永不过期 / -2 已过期 / 秒/分/时/天 */
function formatTtl(ttl: number): string {
  if (ttl === -1) return '永不过期';
  if (ttl === -2) return '已过期';
  if (ttl < 60) return `${ttl} 秒`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)} 分钟`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)} 小时`;
  return `${Math.floor(ttl / 86400)} 天`;
}

/** 缓存管理页（对标老项目 配置中心/缓存管理）：统计卡 + pattern 筛选 + key 列表 + 删除/清空 */
export function CacheAdminPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [searchForm] = Form.useForm();
  const [pattern, setPattern] = useState('*');
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [detail, setDetail] = useState<CacheKey | null>(null);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearPattern, setClearPattern] = useState('');

  const canDelete = usePermission('config:cache:delete');

  const { data, loading, refetch } = useCacheKeysQuery({
    variables: { pattern, offset, limit: pageSize },
    fetchPolicy: 'network-only',
  });
  const { data: totalData, refetch: refetchTotal } = useCacheKeyTotalQuery({
    variables: { pattern },
    fetchPolicy: 'network-only',
  });
  const { data: statsData, refetch: refetchStats } = useCacheStatsQuery({ fetchPolicy: 'network-only' });
  const [getKeyDetail] = useCacheKeyLazyQuery({ fetchPolicy: 'network-only' });
  const [deleteCacheKey] = useDeleteCacheKeyMutation();
  const [deleteCacheKeys, { loading: deletingBatch }] = useDeleteCacheKeysMutation();
  const [clearByPattern, { loading: clearingPattern }] = useClearCacheByPatternMutation();

  const keys = useMemo(() => (data?.cacheKeys ?? []) as CacheKey[], [data]);
  const total = totalData?.cacheKeyTotal ?? 0;

  const load = useCallback(async () => {
    await Promise.all([refetch(), refetchTotal(), refetchStats()]);
  }, [refetch, refetchTotal, refetchStats]);

  useEffect(() => {
    void load();
  }, [load, pattern, offset, pageSize]);

  /** 查询（pattern 切换不自动请求，点查询才发） */
  const handleSearch = (): void => {
    const values = searchForm.getFieldsValue();
    setOffset(0);
    setPattern(values.pattern || '*');
  };

  /** 查看详情 */
  const showDetail = async (key: string): Promise<void> => {
    const res = await getKeyDetail({ variables: { key } });
    if (res.data?.cacheKey) {
      setDetail(res.data.cacheKey as CacheKey);
    }
  };

  const handleDeleteKey = async (key: string): Promise<void> => {
    const existed = await deleteCacheKey({ variables: { key } });
    if (!existed.data?.deleteCacheKey) {
      void message.warning('不存在，可能已被其他进程删除');
    } else {
      void message.success('删除成功');
    }
    await load();
  };

  const handleDeleteKeys = async (): Promise<void> => {
    try {
      const res = await deleteCacheKeys({ variables: { keys: selectedKeys } });
      void message.success(`已删除 ${res.data?.deleteCacheKeys.deletedCount ?? 0} 个 key`);
      setSelectedKeys([]);
      await load();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '批量删除失败');
    }
  };

  const handleClearByPattern = async (): Promise<void> => {
    try {
      const res = await clearByPattern({ variables: { pattern: clearPattern } });
      void message.success(`已按模式清空 ${res.data?.clearCacheByPattern ?? 0} 个 key`);
      setClearModalOpen(false);
      setClearPattern('');
      setOffset(0);
      await load();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '清空失败');
    }
  };

  const columns: ColumnsType<CacheKey> = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (v: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }} copyable={{ text: v }}>
          {v}
        </Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 90,
      render: (v: string) => <Tag color={typeColor[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: 'TTL',
      dataIndex: 'ttl',
      key: 'ttl',
      width: 110,
      render: (v: number) => <Text>{formatTtl(v)}</Text>,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (v: number) => <Text type="secondary">{v} 字符</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_v, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => void showDetail(record.key)}>
            详情
          </Button>
          {canDelete && (
            <Popconfirm
              title="确认删除该缓存 key？"
              onConfirm={() => void handleDeleteKey(record.key)}
              onPopupClick={(e) => e.preventDefault()}
            >
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
      title="缓存管理"
      extra={
        <Space size="small">
          {canDelete && (
            <>
              <Button color="red" variant="outlined" onClick={() => setClearModalOpen(true)}>
                按 Pattern 清空
              </Button>
              <Popconfirm
                title={`确认删除选中的 ${selectedKeys.length} 个 key？`}
                onConfirm={() => void handleDeleteKeys()}
              >
                <Button
                  color="red"
                  variant="solid"
                  disabled={selectedKeys.length === 0}
                  loading={deletingBatch}
                >
                  批量删除{selectedKeys.length > 0 ? ` (${selectedKeys.length})` : ''}
                </Button>
              </Popconfirm>
            </>
          )}
          <Button onClick={() => void load()}>刷新</Button>
        </Space>
      }
    >
      {/* 统计卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card size="small">
          <Statistic title="已用内存" value={statsData?.cacheStats.usedMemory ?? '-'} />
        </Card>
        <Card size="small">
          <Statistic title="命中率" value={statsData?.cacheStats.hitRate ?? '-'} />
        </Card>
        <Card size="small">
          <Statistic title="运行时长" value={statsData?.cacheStats.uptime ?? '-'} />
        </Card>
      </div>

            {/* pattern 筛选 */}
      <Form
        form={searchForm}
        layout="inline"
        style={{ marginBottom: 16 }}
        onFinish={handleSearch}
      >
        <Form.Item name="pattern" label="Pattern" initialValue="*">
          <Input
            allowClear
            placeholder="如 mono:auth:*（* 表示全部）"
            style={{ width: 260 }}
          />
        </Form.Item>
        <Form.Item>
          <Space size="small">
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button onClick={() => { searchForm.setFieldValue('pattern', '*'); setOffset(0); setPattern('*'); }}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Table<CacheKey>
        rowKey="key"
        columns={columns}
        dataSource={keys}
        loading={loading}
        rowSelection={
          canDelete
            ? {
                selectedRowKeys: selectedKeys,
                onChange: (rows) => setSelectedKeys(rows as string[]),
              }
            : undefined
        }
        pagination={{
          current: Math.floor(offset / pageSize) + 1,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (t) => `共 ${t} 个 key`,
          onChange: (p, ps) => {
            setOffset((p - 1) * ps);
            setPageSize(ps);
            setSelectedKeys([]); // 翻页清空勾选防跨页误删
          },
        }}
      />

      {/* 详情 Modal */}
      <Modal
        title="缓存 Key 详情"
        open={detail !== null}
        onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
        width={640}
      >
        {detail && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px' }}>
            <Text type="secondary">Key</Text>
            <Text style={{ fontFamily: 'monospace' }} copyable>
              {detail.key}
            </Text>
            <Text type="secondary">类型</Text>
            <Tag color={typeColor[detail.type] ?? 'default'}>{detail.type}</Tag>
            <Text type="secondary">TTL</Text>
            <Text>{formatTtl(detail.ttl)}</Text>
            <Text type="secondary">大小</Text>
            <Text>{detail.size} 字符</Text>
            <Text type="secondary">Value</Text>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: 'rgba(0,0,0,0.03)',
                padding: 8,
                borderRadius: 4,
                fontSize: 12,
                maxHeight: 320,
                overflow: 'auto',
              }}
            >
              {detail.value ?? '(空)'}
            </pre>
          </div>
        )}
      </Modal>

      {/* 按 pattern 清空 Modal */}
      <Modal
        title="按 Pattern 清空缓存"
        open={clearModalOpen}
        onCancel={() => setClearModalOpen(false)}
        onOk={() => void handleClearByPattern()}
        okText="确认清空"
        cancelText="取消"
        confirmLoading={clearingPattern}
        okButtonProps={{ color: 'red', variant: 'solid' }}
        width={480}
      >
        <Alert
          type="warning"
          showIcon
          title="此操作不可恢复"
          description="将删除所有匹配该模式的缓存 key，请谨慎操作"
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical">
          <Form.Item label="Pattern" required>
            <Input
              value={clearPattern}
              onChange={(e) => setClearPattern(e.target.value)}
              placeholder="如 mono:auth:*（不允许以 * 开头）"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
