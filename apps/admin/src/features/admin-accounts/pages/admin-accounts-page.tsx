import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeliveredProcedureOutlined,
  FilterOutlined,
  PlusOutlined,
  RedoOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { ApolloError } from '@apollo/client';
import { CreateAdminAccountSchema, UpdateAdminAccountSchema } from '@starter/api-client';

import { usePermission } from '../../../app/auth/use-permission.js';
import { downloadBlob, toCSV } from '../../../shared/utils/export.js';
import {
  useAdminAccountsQuery,
  useAdminRolesQuery,
  useCreateAdminAccountMutation,
  useUpdateAdminAccountMutation,
  useDeleteAdminAccountMutation,
} from '../../../generated/graphql';
import type {
  AdminAccount,
  CreateAdminAccountInput,
  UpdateAdminAccountInput,
} from '../../../generated/graphql';

const DEFAULT_PAGE_SIZE = 10;

/** GraphQL 错误 → 用户提示 */
function showMutationError(error: unknown): void {
  if (error instanceof ApolloError) {
    void message.error(error.graphQLErrors[0]?.message ?? '操作失败，请稍后重试');
    return;
  }
  void message.error('操作失败，请稍后重试');
}

/** 把 zod 校验失败映射为 antd 表单字段错误 */
function applyZodErrors(
  form: ReturnType<typeof Form.useForm>[0],
  result: { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }
): void {
  form.setFields(
    result.error.issues.map((issue) => ({
      name: issue.path.map(String),
      errors: [issue.message],
    }))
  );
}

/** 管理端账户管理页：列表 + 创建/编辑/删除（权限按钮控制） */
export function AdminAccountsPage(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(['username', 'nickname', 'email', 'roleCodes', 'enabled', 'actions']),
  );
  const [form] = Form.useForm();
  const [searchForm] = Form.useForm();

  const canCreate = usePermission('account:create');
  const canUpdate = usePermission('account:update');
  const canDelete = usePermission('account:delete');

  const { data, loading, refetch } = useAdminAccountsQuery({ variables: { page, pageSize } });
  const { data: rolesData } = useAdminRolesQuery();
  const [createAccount, { loading: createLoading }] = useCreateAdminAccountMutation();
  const [updateAccount, { loading: updateLoading }] = useUpdateAdminAccountMutation();
  const [deleteAccount, { loading: deleteLoading }] = useDeleteAdminAccountMutation();

  const accounts = useMemo(() => data?.adminAccounts.items ?? [], [data?.adminAccounts]);
  const total = data?.adminAccounts.total ?? 0;
  const filteredAccounts = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return accounts;
    return accounts.filter(
      (a) =>
        a.username.toLowerCase().includes(kw) ||
        a.nickname.toLowerCase().includes(kw) ||
        a.email.toLowerCase().includes(kw),
    );
  }, [accounts, keyword]);
  const roleOptions = (rolesData?.adminRoles ?? []).map((role) => ({
    value: role.code,
    label: `${role.name}（${role.code}）`,
  }));

  const refreshList = async (): Promise<void> => {
    await refetch({ page, pageSize });
  };

  const openCreate = (): void => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (account: AdminAccount): void => {
    setEditingId(account.accountId);
    form.setFieldsValue({
      nickname: account.nickname,
      email: account.email,
      enabled: account.enabled,
      roleCodes: account.roleCodes,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (): Promise<void> => {
    const values = form.getFieldsValue();
    const schema = editingId === null ? CreateAdminAccountSchema : UpdateAdminAccountSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(form, parsed);
      return;
    }
    try {
      if (editingId === null) {
        await createAccount({
          variables: { input: parsed.data as unknown as CreateAdminAccountInput },
        });
        void message.success('创建成功');
      } else {
        await updateAccount({
          variables: {
            id: editingId,
            input: parsed.data as unknown as UpdateAdminAccountInput,
          },
        });
        void message.success('更新成功');
      }
      setModalOpen(false);
      form.resetFields();
      await refreshList();
    } catch (error) {
      showMutationError(error);
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await deleteAccount({ variables: { id } });
      void message.success('删除成功');
      await refreshList();
    } catch (error) {
      showMutationError(error);
    }
  };

  const fullColumns: ColumnsType<AdminAccount> = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色',
      dataIndex: 'roleCodes',
      key: 'roleCodes',
      render: (roleCodes: string[]) => roleCodes.join(', '),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean) => (enabled ? '是' : '否'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_value, account) => (
        <Space>
          {canUpdate && (
            <Button type="link" size="small" onClick={() => openEdit(account)}>
              编辑
            </Button>
          )}
          {canDelete && (
            <Popconfirm title="确认删除该账户？删除后其所有 token 失效" onConfirm={() => handleRemove(account.accountId)}>
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          )}
          {!canUpdate && !canDelete && <Typography.Text type="secondary">无权限</Typography.Text>}
        </Space>
      ),
    },
  ];

  // 列控制：切换显隐（操作列固定显示，至少保留一列）
  const toggleColumn = (key: string): void => {
    setVisibleKeys((prev) => {
      if (prev.has(key)) {
        if (prev.size <= 1) {
          void message.warning('至少保留一列');
          return prev;
        }
        const next = new Set(prev);
        next.delete(key);
        return next;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const columnMenuItems = fullColumns.map((c) => ({
    key: c.key as string,
    label: (
      <Checkbox
        checked={visibleKeys.has(c.key as string)}
        disabled={c.key === 'actions'}
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggleColumn(c.key as string)}
      >
        {String(c.title)}
      </Checkbox>
    ),
  }));

  // 列过滤开销极小，直接计算（避免 fullColumns 引用变化导致的 useMemo 抖动）
  const columns = fullColumns.filter((c) => visibleKeys.has(c.key as string));

  // 导出 CSV：导出过滤后的账户（含可见列）
  const handleExport = (): void => {
    const exportCols = fullColumns.filter((c) => visibleKeys.has(c.key as string) && c.key !== 'actions');
    const header = exportCols.map((c) => String(c.title));
    const rows: (string | number | boolean | null | undefined)[][] = [
      header,
      ...filteredAccounts.map((a) =>
        exportCols.map((c) => {
          if (c.key === 'enabled') return a.enabled ? '正常' : '禁用';
          if (c.key === 'roleCodes') return a.roleCodes.join(' / ');
          const dataIdx = (c as { dataIndex?: string }).dataIndex ?? (c.key as string);
          const v = (a as unknown as Record<string, unknown>)[dataIdx];
          return (v as string | number | boolean | null | undefined) ?? '';
        }),
      ),
    ];
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    downloadBlob(toCSV(rows), `账户管理_${ts}.csv`, 'text/csv;charset=utf-8;');
    void message.success(`已导出 ${filteredAccounts.length} 条`);
  };

  return (
    <div>
      {/* 搜索卡 */}
      <Card style={{ marginBottom: 16 }}>
        <Form
          form={searchForm}
          layout="inline"
          onFinish={(values: { keyword?: string }) => setKeyword(values.keyword ?? '')}
        >
          <Form.Item name="keyword" style={{ marginBottom: 0 }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="按用户名 / 昵称 / 邮箱搜索"
              style={{ width: 300 }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button
                onClick={() => {
                  searchForm.resetFields();
                  setKeyword('');
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 表格卡：标题 + 工具条（新建 / 列控制 / 导出 / 刷新） */}
      <Card
        title="账户列表"
        extra={
          <Space size="small">
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新建账户
              </Button>
            )}
            <Dropdown
              trigger={['click']}
              menu={{ items: columnMenuItems, onClick: (info) => info.domEvent.stopPropagation() }}
            >
              <Button icon={<FilterOutlined />} aria-label="列控制" />
            </Dropdown>
            <Button icon={<DeliveredProcedureOutlined />} onClick={handleExport} aria-label="导出 CSV" />
            <Button icon={<RedoOutlined />} onClick={() => void refreshList()} aria-label="刷新" />
          </Space>
        }
      >
      <Table<AdminAccount>
        rowKey="accountId"
        columns={columns}
        dataSource={filteredAccounts}
        loading={loading}
        locale={{ emptyText: '暂无数据' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPageSize === pageSize ? nextPage : 1);
            setPageSize(nextPageSize);
          },
        }}
      />
      </Card>

      <Modal
        title={editingId === null ? '新建账户' : '编辑账户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={createLoading || updateLoading || deleteLoading}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {editingId === null && (
            <>
              <Form.Item label="用户名" name="username">
                <Input placeholder="3-50 个字符（登录用）" />
              </Form.Item>
              <Form.Item label="密码" name="password">
                <Input.Password placeholder="至少 8 位" autoComplete="new-password" />
              </Form.Item>
            </>
          )}
          <Form.Item label="昵称" name="nickname">
            <Input placeholder="显示名称" />
          </Form.Item>
          <Form.Item label="邮箱" name="email">
            <Input placeholder="name@example.com" />
          </Form.Item>
          <Form.Item label="角色" name="roleCodes">
            <Select mode="multiple" options={roleOptions} placeholder="至少选择一个角色" />
          </Form.Item>
          {editingId !== null && (
            <Form.Item label="启用" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
