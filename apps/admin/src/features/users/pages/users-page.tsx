import { useState } from 'react';
import {
  Button,
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
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiClientError,
  getUsersControllerListQueryKey,
  useUsersControllerCreate,
  useUsersControllerList,
  useUsersControllerRemove,
  useUsersControllerUpdate,
} from '@starter/api-client';
import type { CreateUserDto, UpdateUserDto, UserVo } from '@starter/api-client';
import { CreateUserSchema, UpdateUserSchema, userRoleSchema, userStatusSchema } from '@starter/api-client';
import { StatusTag } from '@starter/ui';

const DEFAULT_PAGE_SIZE = 10;

/** 表单初始值（创建时） */
const CREATE_INITIAL_VALUES = { username: '', email: '', role: 'member', status: 'active' } as const;

/** 把 mutation 失败映射为用户提示：业务错误透传消息，其他错误给出通用提示 */
function showMutationError(error: unknown): void {
  if (error instanceof ApiClientError) {
    void message.error(error.message);
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
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useUsersControllerList({ page, pageSize });
  const createMutation = useUsersControllerCreate();
  const updateMutation = useUsersControllerUpdate();
  const removeMutation = useUsersControllerRemove();

  const users = data?.items ?? [];
  const total = data?.total ?? 0;

  const refreshList = async (): Promise<void> => {
    // 只失效用户列表查询，避免连带失效 health 等无关缓存
    await queryClient.invalidateQueries({
      queryKey: getUsersControllerListQueryKey(),
    });
  };

  const openCreate = (): void => {
    setEditingId(null);
    form.setFieldsValue(CREATE_INITIAL_VALUES);
    setModalOpen(true);
  };

  const openEdit = (user: UserVo): void => {
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
        await createMutation.mutateAsync({ data: parsed.data as CreateUserDto });
        void message.success('创建成功');
      } else {
        await updateMutation.mutateAsync({ id: editingId, data: parsed.data as UpdateUserDto });
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
      await removeMutation.mutateAsync({ id });
      void message.success('删除成功');
      await refreshList();
    } catch (error) {
      showMutationError(error);
    }
  };

  const columns: ColumnsType<UserVo> = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: UserVo['status']) => <StatusTag status={status} />,
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_value, user) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(user)}>
            编辑
          </Button>
          <Popconfirm title="确认删除该用户？" onConfirm={() => handleRemove(user.id)}>
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          用户管理
        </Typography.Title>
        <Button type="primary" onClick={openCreate}>
          新建用户
        </Button>
      </div>

      <Table<UserVo>
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={isLoading}
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

      <Modal
        title={editingId === null ? '新建用户' : '编辑用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={createMutation.isPending || updateMutation.isPending}
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
