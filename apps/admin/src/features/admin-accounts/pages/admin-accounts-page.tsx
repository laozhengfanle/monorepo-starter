import { useState } from 'react';
import {
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
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { ApolloError } from '@apollo/client';
import { CreateAdminAccountSchema, UpdateAdminAccountSchema } from '@starter/api-client';
import { PageHeader } from '@starter/ui';
import { usePermission } from '../../../app/auth/use-permission.js';
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
  const [form] = Form.useForm();

  const canCreate = usePermission('account:create');
  const canUpdate = usePermission('account:update');
  const canDelete = usePermission('account:delete');

  const { data, loading, refetch } = useAdminAccountsQuery({ variables: { page, pageSize } });
  const { data: rolesData } = useAdminRolesQuery();
  const [createAccount, { loading: createLoading }] = useCreateAdminAccountMutation();
  const [updateAccount, { loading: updateLoading }] = useUpdateAdminAccountMutation();
  const [deleteAccount, { loading: deleteLoading }] = useDeleteAdminAccountMutation();

  const accounts = data?.adminAccounts.items ?? [];
  const total = data?.adminAccounts.total ?? 0;
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

  const columns: ColumnsType<AdminAccount> = [
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

  return (
    <div>
      <PageHeader
        title="账户管理"
        description="管理端账户：账号 CRUD + 角色分配（删除同步撤销 token 与角色绑定）"
        extra={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建账户
            </Button>
          ) : undefined
        }
      />

      <Card>
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
