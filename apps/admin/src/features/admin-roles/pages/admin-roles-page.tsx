import { useState } from 'react';
import {
  Button,
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
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ApolloError } from '@apollo/client';
import { CreateRoleSchema, UpdateRoleSchema } from '@starter/api-client';
import type { AdminRole, CreateRoleInput, UpdateRoleInput } from '@starter/api-client';
import { usePermission } from '../../../app/auth/use-permission.js';
import {
  useAdminRoleListQuery,
  usePermissionCodeListQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
} from '../../../generated/graphql';

const SUPER_ADMIN_CODE = 'super_admin';

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

/** 权限点选项：按类型分组（menu 菜单 / button 按钮） */
function buildPermissionOptions(
  permissions: { code: string; name: string; type: string }[]
): { label: string; options: { value: string; label: string }[] }[] {
  const typeLabels: Record<string, string> = {
    menu: '菜单权限',
    button: '按钮权限',
  };
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const perm of permissions) {
    const key = typeLabels[perm.type] ?? perm.type;
    const list = groups.get(key) ?? [];
    list.push({ value: perm.code, label: `${perm.name}（${perm.code}）` });
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([label, options]) => ({ label, options }));
}

/** 角色权限管理页：角色 CRUD + 权限点分配（权限按钮控制） */
export function AdminRolesPage(): React.JSX.Element {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const canCreate = usePermission('role:create');
  const canUpdate = usePermission('role:update');
  const canDelete = usePermission('role:delete');

  const { data, loading, refetch } = useAdminRoleListQuery();
  const { data: permissionsData } = usePermissionCodeListQuery();
  const [createRole, { loading: createLoading }] = useCreateRoleMutation();
  const [updateRole, { loading: updateLoading }] = useUpdateRoleMutation();
  const [deleteRole, { loading: deleteLoading }] = useDeleteRoleMutation();

  const roles = data?.adminRoles ?? [];
  const permissionOptions = buildPermissionOptions(permissionsData?.permissionCodes ?? []);

  const refreshList = async (): Promise<void> => {
    await refetch();
  };

  const openCreate = (): void => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setModalOpen(true);
  };

  const openEdit = (role: AdminRole): void => {
    setEditingId(role.id);
    form.setFieldsValue({
      name: role.name,
      description: role.description,
      enabled: role.enabled,
      permissionCodes: role.permissionCodes,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (): Promise<void> => {
    const values = form.getFieldsValue();
    const schema = editingId === null ? CreateRoleSchema : UpdateRoleSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(form, parsed);
      return;
    }
    try {
      if (editingId === null) {
        await createRole({
          variables: { input: parsed.data as unknown as CreateRoleInput },
        });
        void message.success('创建成功');
      } else {
        await updateRole({
          variables: { id: editingId, input: parsed.data as unknown as UpdateRoleInput },
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
      await deleteRole({ variables: { id } });
      void message.success('删除成功');
      await refreshList();
    } catch (error) {
      showMutationError(error);
    }
  };

  const columns: ColumnsType<AdminRole> = [
    { title: '角色名', dataIndex: 'name', key: 'name' },
    { title: '编码', dataIndex: 'code', key: 'code' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '权限点',
      dataIndex: 'permissionCodes',
      key: 'permissionCodes',
      render: (codes: string[]) => (
        <Space size={[4, 4]} wrap>
          {codes.map((code) => (
            <Tag key={code} color={code.endsWith(':list') ? 'blue' : 'default'}>
              {code}
            </Tag>
          ))}
        </Space>
      ),
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
      render: (_value, role) => {
        const isSuperAdmin = role.code === SUPER_ADMIN_CODE;
        return (
          <Space>
            {canUpdate && (
              <Button type="link" size="small" onClick={() => openEdit(role)}>
                编辑
              </Button>
            )}
            {canDelete && !isSuperAdmin && (
              <Popconfirm title="确认删除该角色？" onConfirm={() => handleRemove(role.id)}>
                <Button type="link" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
            {!canUpdate && !canDelete && <Typography.Text type="secondary">无权限</Typography.Text>}
            {isSuperAdmin && <Typography.Text type="secondary">内置角色</Typography.Text>}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          角色权限
        </Typography.Title>
        {canCreate && (
          <Button type="primary" onClick={openCreate}>
            新建角色
          </Button>
        )}
      </div>

      <Table<AdminRole>
        rowKey="id"
        columns={columns}
        dataSource={roles}
        loading={loading}
        locale={{ emptyText: '暂无数据' }}
        pagination={false}
      />

      <Modal
        title={editingId === null ? '新建角色' : '编辑角色'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={createLoading || updateLoading || deleteLoading}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item label="角色名" name="name">
            <Input placeholder="如：运营人员" />
          </Form.Item>
          {editingId === null && (
            <Form.Item label="角色编码" name="code">
              <Input placeholder="小写字母开头，如：operator" />
            </Form.Item>
          )}
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="角色职责说明（可选）" maxLength={255} showCount />
          </Form.Item>
          <Form.Item label="权限点" name="permissionCodes">
            <Select
              mode="multiple"
              options={permissionOptions}
              placeholder="勾选该角色可访问的菜单与操作"
              optionFilterProp="label"
            />
          </Form.Item>
          {editingId !== null && (
            <Form.Item
              label="启用"
              name="enabled"
              valuePropName="checked"
              extra={roles.find((r) => r.id === editingId)?.code === SUPER_ADMIN_CODE ? '内置超管角色不允许禁用' : undefined}
            >
              <Switch disabled={roles.find((r) => r.id === editingId)?.code === SUPER_ADMIN_CODE} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
