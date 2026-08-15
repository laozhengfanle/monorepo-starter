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
  Table,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { ApolloError } from '@apollo/client';
import {
  CreateUserSchema,
  UpdateUserSchema,
  userRoleSchema,
  userStatusSchema,
} from '@starter/api-client';
import { PageHeader, StatusTag } from '@starter/ui';
import {
  useUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} from '../../../generated/graphql';
import type {
  User,
  UserRole,
  UserStatus,
  CreateUserInput,
  UpdateUserInput,
} from '../../../generated/graphql';
import { usePermission } from '../../../app/auth/use-permission.js';

const DEFAULT_PAGE_SIZE = 10;

/** 表单初始值（创建时） */
const CREATE_INITIAL_VALUES = { username: '', email: '', role: 'member', status: 'active' } as const;

/** GraphQL 错误 → 用户提示：取首个 GraphQL 错误的业务 message */
function showMutationError(error: unknown): void {
  if (error instanceof ApolloError) {
    const gqlError = error.graphQLErrors[0];
    void message.error(gqlError?.message ?? '操作失败，请稍后重试');
    return;
  }
  console.error('mutation failed', error);
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

export function UsersPage(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  // 按钮级权限控制（与后端 @RequirePermission 的 permissionCode 对应）
  const canCreate = usePermission('user:create');
  const canUpdate = usePermission('user:update');
  const canDelete = usePermission('user:delete');

  const { data, loading, refetch } = useUsersQuery({ variables: { page, pageSize } });
  const [createUser, { loading: createLoading }] = useCreateUserMutation();
  const [updateUser, { loading: updateLoading }] = useUpdateUserMutation();
  const [deleteUser, { loading: deleteLoading }] = useDeleteUserMutation();

  const users = data?.users.items ?? [];
  const total = data?.users.total ?? 0;

  const refreshList = async (): Promise<void> => {
    await refetch({ page, pageSize });
  };

  const openCreate = (): void => {
    setEditingId(null);
    form.setFieldsValue(CREATE_INITIAL_VALUES);
    setModalOpen(true);
  };

  const openEdit = (user: User): void => {
    setEditingId(user.id);
    form.setFieldsValue({
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (): Promise<void> => {
    const values = form.getFieldsValue();
    const schema = editingId === null ? CreateUserSchema : UpdateUserSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(form, parsed);
      return;
    }
    try {
      if (editingId === null) {
        await createUser({
          variables: { input: parsed.data as unknown as CreateUserInput },
        });
        void message.success('创建成功');
      } else {
        await updateUser({
          variables: { id: editingId, input: parsed.data as unknown as UpdateUserInput },
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
      await deleteUser({ variables: { id } });
      void message.success('删除成功');
      await refreshList();
    } catch (error) {
      showMutationError(error);
    }
  };

  const columns: ColumnsType<User> = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: UserRole) => role,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: UserStatus) => <StatusTag status={status} />,
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_value, user) => (
        <Space>
          {canUpdate && (
            <Button type="link" size="small" onClick={() => openEdit(user)}>
              编辑
            </Button>
          )}
          {canDelete && (
            <Popconfirm title="确认删除该用户？" onConfirm={() => handleRemove(user.id)}>
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
        title="用户管理"
        description="演示模块：用户 CRUD（GraphQL + REST 双协议示例）"
        extra={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建用户
            </Button>
          ) : undefined
        }
      />

      <Card>
        <Table<User>
          rowKey="id"
          columns={columns}
          dataSource={users}
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
        title={editingId === null ? '新建用户' : '编辑用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={createLoading || updateLoading || deleteLoading}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={CREATE_INITIAL_VALUES}>
          <Form.Item label="用户名" name="username">
            <Input placeholder="3-30 个字符" />
          </Form.Item>
          <Form.Item label="邮箱" name="email">
            <Input placeholder="name@example.com" />
          </Form.Item>
          <Form.Item label="角色" name="role">
            <Select options={userRoleSchema.options.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={userStatusSchema.options.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
