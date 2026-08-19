import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchBar, type SearchValues } from '@starter/ui';
import { PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import {
  CreateAdminAccountSchema,
  UpdateAdminAccountSchema,
} from '@starter/api-client';

import { usePermission } from '../../../app/auth/use-permission.js';
import { useSystemConfig } from '../../../app/providers/system-config-provider.js';
import { AccountPermissionModal } from '../account-permission-modal.js';
import { hardRemoveAccountApi, restoreAccountApi } from '../api.js';
import { useColumnControl } from '../../../shared/hooks/use-column-control.js';
import { TableToolbar } from '../../../shared/components/table-toolbar.js';
import { passwordPolicyRule } from '../../../shared/utils/password-policy.js';
import {
  applyZodErrors,
  showMutationError,
} from '../../../shared/utils/form-errors.js';
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
} from '../../../generated/graphql-types';

const DEFAULT_PAGE_SIZE = 10;

/** 管理端账户管理页：列表 + 创建/编辑/删除（权限按钮控制） */
export function AdminAccountsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // 服务端筛选（点「查询」才生效，对标老项目 Vue 管理员查询）
  const [filters, setFilters] = useState<{
    username?: string;
    email?: string;
    roleCode?: string;
    enabled?: boolean;
    includeDeleted?: boolean;
  }>({});
  const [form] = Form.useForm();
  // 特例授权弹窗
  const [permAccount, setPermAccount] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { settings: sysSettings } = useSystemConfig();
  const canCreate = usePermission('account:create');
  const canUpdate = usePermission('account:update');
  const canDelete = usePermission('account:delete');
  // 软删除权限（对标老项目 Vue global:trash:*）
  const canViewTrash = usePermission('global:trash:view');
  const canRestoreTrash = usePermission('global:trash:restore');
  const canHardDeleteTrash = usePermission('global:trash:hard_delete');

  const { data, loading, refetch } = useAdminAccountsQuery({
    variables: {
      query: {
        page,
        pageSize,
        ...(filters.username ? { username: filters.username } : {}),
        ...(filters.email ? { email: filters.email } : {}),
        ...(filters.roleCode ? { roleCode: filters.roleCode } : {}),
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
        includeDeleted: filters.includeDeleted ?? false,
      },
    },
  });
  const { data: rolesData } = useAdminRolesQuery();
  const [createAccount, { loading: createLoading }] =
    useCreateAdminAccountMutation();
  const [updateAccount, { loading: updateLoading }] =
    useUpdateAdminAccountMutation();
  const [deleteAccount, { loading: deleteLoading }] =
    useDeleteAdminAccountMutation();

  const accounts = useMemo(
    () => data?.adminAccounts.items ?? [],
    [data?.adminAccounts],
  );
  const total = data?.adminAccounts.total ?? 0;
  const roleOptions = (rolesData?.adminRoles ?? []).map((role) => ({
    value: role.code,
    label: role.name,
  }));

  const refreshList = async (): Promise<void> => {
    await refetch({
      query: {
        page,
        pageSize,
        ...(filters.username ? { username: filters.username } : {}),
        ...(filters.email ? { email: filters.email } : {}),
        ...(filters.roleCode ? { roleCode: filters.roleCode } : {}),
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
        includeDeleted: filters.includeDeleted ?? false,
      },
    });
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
    // 密码策略为后台设置动态值：先用表单动态规则校验（passwordPolicyRule），
    // zod 静态契约 min(8) 可能严于策略（如设置为 6），故 zod 校验跳过 password 字段
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const values = form.getFieldsValue();
    const schema =
      editingId === null ? CreateAdminAccountSchema : UpdateAdminAccountSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const nonPasswordIssues = parsed.error.issues.filter(
        (issue) => issue.path[0] !== 'password',
      );
      if (nonPasswordIssues.length > 0) {
        applyZodErrors(form, {
          success: false,
          error: { issues: nonPasswordIssues },
        });
        return;
      }
    }
    const input = (parsed.success
      ? parsed.data
      : values) as unknown as CreateAdminAccountInput;
    try {
      if (editingId === null) {
        await createAccount({
          variables: { input },
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
      showMutationError(message, error);
    }
  };

  const handleRestore = async (id: string): Promise<void> => {
    setActionLoading(true);
    try {
      await restoreAccountApi(id);
      void message.success('已恢复正常');
      await refreshList();
    } catch {
      void message.error('恢复失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const handleHardRemove = async (id: string): Promise<void> => {
    setActionLoading(true);
    try {
      await hardRemoveAccountApi(id);
      void message.success('已彻底删除');
      await refreshList();
    } catch {
      void message.error('彻底删除失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await deleteAccount({ variables: { id } });
      void message.success('删除成功');
      await refreshList();
    } catch (error) {
      showMutationError(message, error);
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
      title: '状态',
      dataIndex: 'deletedAt',
      key: 'status',
      width: 130,
      render: (_value: string | null, account) => {
        if (account.deletedAt) {
          return (
            <Space size="small">
              <Tag color="red">已删除</Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {account.deletedAt.slice(0, 10)}
              </Typography.Text>
            </Space>
          );
        }
        return account.enabled ? (
          <Tag color="green">正常</Tag>
        ) : (
          <Tag>禁用</Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_value, account) => {
        const isDeleted = Boolean(account.deletedAt);
        return (
          <Space>
            {!isDeleted && canUpdate && (
              <Button
                type="link"
                size="small"
                onClick={() => openEdit(account)}
              >
                编辑
              </Button>
            )}
            {!isDeleted && canUpdate && (
              <Button
                color="purple"
                variant="link"
                size="small"
                icon={<SafetyCertificateOutlined />}
                onClick={() =>
                  setPermAccount({
                    id: account.accountId,
                    name: account.username,
                  })
                }
              >
                特例授权
              </Button>
            )}
            {!isDeleted && canDelete && (
              <Popconfirm
                title="确认删除该账户？删除后其所有 token 失效"
                onConfirm={() => handleRemove(account.accountId)}
              >
                <Button color="danger" variant="link" size="small">
                  删除
                </Button>
              </Popconfirm>
            )}
            {isDeleted && canRestoreTrash && (
              <Button
                type="link"
                size="small"
                loading={actionLoading}
                onClick={() => void handleRestore(account.accountId)}
              >
                恢复正常
              </Button>
            )}
            {isDeleted && canHardDeleteTrash && (
              <Popconfirm
                title="彻底删除？账户的所有关联数据将永久删除且不可恢复"
                onConfirm={() => handleHardRemove(account.accountId)}
              >
                <Button
                  color="danger"
                  variant="link"
                  size="small"
                  loading={actionLoading}
                >
                  彻底删除
                </Button>
              </Popconfirm>
            )}
            {!canUpdate && !canDelete && (
              <Typography.Text type="secondary">无权限</Typography.Text>
            )}
          </Space>
        );
      },
    },
  ];

  // 列控制 + 导出（共享 hook，行为与既有实现一致：操作列固定、至少保留一列、导可见列）
  const { columnMenuItems, columns, handleExport } =
    useColumnControl<AdminAccount>({
      fullColumns,
      initialVisibleKeys: [
        'username',
        'nickname',
        'email',
        'roleCodes',
        'status',
        'actions',
      ],
      exportFileNamePrefix: '账户管理',
      exportData: accounts,
      exportCell: (key, account) => {
        if (key === 'status') {
          return account.deletedAt
            ? `已删除 ${account.deletedAt.slice(0, 10)}`
            : account.enabled
              ? '正常'
              : '禁用';
        }
        if (key === 'roleCodes') return account.roleCodes.join(' / ');
        return undefined;
      },
    });

  return (
    <div>
      {/* 搜索卡：独立 Card 位于列表正上方（列表页规范）；点「查询」才请求 */}
      <SearchBar
        fields={[
          {
            name: 'username',
            label: '用户名',
            type: 'input',
            placeholder: '请输入用户名',
          },
          {
            name: 'email',
            label: '邮箱',
            type: 'input',
            placeholder: '请输入邮箱',
          },
          {
            name: 'roleCode',
            label: '角色',
            type: 'select',
            placeholder: '全部',
            options: roleOptions,
          },
          {
            name: 'enabled',
            label: '状态',
            type: 'select',
            placeholder: '全部',
            options: [
              { value: 'enabled', label: '正常' },
              { value: 'disabled', label: '禁用' },
            ],
          },
          ...(canViewTrash
            ? [
                {
                  name: 'includeDeleted',
                  label: '',
                  type: 'checkbox' as const,
                  checkLabel: '显示已删除',
                },
              ]
            : []),
        ]}
        onSearch={(values: SearchValues) => {
          setPage(1);
          setFilters({
            username: (values.username as string | undefined) || undefined,
            email: (values.email as string | undefined) || undefined,
            roleCode: (values.roleCode as string | undefined) || undefined,
            enabled:
              values.enabled === 'enabled'
                ? true
                : values.enabled === 'disabled'
                  ? false
                  : undefined,
            includeDeleted: Boolean(values.includeDeleted),
          });
        }}
        onReset={() => {
          setFilters({});
          setPage(1);
        }}
      />

      {/* 表格卡：标题 + 工具条（新建 / 列控制 / 导出 / 刷新） */}
      <Card
        title="账户列表"
        extra={
          <TableToolbar
            columnMenuItems={columnMenuItems}
            onExport={handleExport}
            onRefresh={() => void refreshList()}
            extra={
              canCreate && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreate}
                >
                  新建账户
                </Button>
              )
            }
          />
        }
      >
        <Table<AdminAccount>
          rowKey="accountId"
          columns={columns}
          dataSource={accounts}
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
      >
        <Form form={form} layout="vertical">
          {editingId === null && (
            <>
              <Form.Item label="用户名" name="username">
                <Input placeholder="3-50 个字符（登录用）" />
              </Form.Item>
              <Form.Item
                label="密码"
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  passwordPolicyRule(sysSettings),
                ]}
              >
                <Input.Password
                  placeholder={`至少 ${sysSettings.passwordMinLength} 位`}
                  autoComplete="new-password"
                />
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
            <Select
              mode="multiple"
              options={roleOptions}
              placeholder="至少选择一个角色"
            />
          </Form.Item>
          {editingId !== null && (
            <Form.Item label="启用" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <AccountPermissionModal
        open={permAccount !== null}
        accountId={permAccount?.id ?? ''}
        accountName={permAccount?.name ?? ''}
        onClose={() => setPermAccount(null)}
      />
    </div>
  );
}
