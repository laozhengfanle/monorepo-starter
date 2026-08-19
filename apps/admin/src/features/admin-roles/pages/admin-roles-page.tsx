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
import { PlusOutlined } from '@ant-design/icons';
import { CreateRoleSchema, UpdateRoleSchema } from '@starter/api-client';
import type {
  AdminRole,
  CreateRoleInput,
  UpdateRoleInput,
} from '@starter/api-client';
import { usePermission } from '../../../app/auth/use-permission.js';
import {
  useAdminRoleListQuery,
  usePermissionCodeListQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
} from '../../../generated/graphql';
import { useColumnControl } from '../../../shared/hooks/use-column-control.js';
import { TableToolbar } from '../../../shared/components/table-toolbar.js';
import {
  applyZodErrors,
  showMutationError,
} from '../../../shared/utils/form-errors.js';

const SUPER_ADMIN_CODE = 'super_admin';

/** 权限点选项：按类型分组（menu 菜单 / button 按钮） */
function buildPermissionOptions(
  permissions: { code: string; name: string; type: string }[],
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
  return Array.from(groups.entries()).map(([label, options]) => ({
    label,
    options,
  }));
}

/** 角色权限管理页（对标 antd-admin RolePage）：搜索卡 + 表格卡（列控制/导出/刷新） */
export function AdminRolesPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  const canCreate = usePermission('role:create');
  const canUpdate = usePermission('role:update');
  const canDelete = usePermission('role:delete');

  const { data, loading, refetch } = useAdminRoleListQuery();
  const { data: permissionsData } = usePermissionCodeListQuery();
  const [createRole, { loading: createLoading }] = useCreateRoleMutation();
  const [updateRole, { loading: updateLoading }] = useUpdateRoleMutation();
  const [deleteRole, { loading: deleteLoading }] = useDeleteRoleMutation();

  const roles = useMemo(() => data?.adminRoles ?? [], [data?.adminRoles]);
  const permissionOptions = buildPermissionOptions(
    permissionsData?.permissionCodes ?? [],
  );
  /** 当前编辑角色的编码（用于超管保护判断） */
  const editingRoleCode = useMemo(
    () => roles.find((r) => r.id === editingId)?.code ?? null,
    [roles, editingId],
  );

  // 关键词过滤（角色数据量小，前端一次性过滤）
  const filteredRoles = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return roles;
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(kw) || r.code.toLowerCase().includes(kw),
    );
  }, [roles, keyword]);

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
          variables: {
            id: editingId,
            input: parsed.data as unknown as UpdateRoleInput,
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

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await deleteRole({ variables: { id } });
      void message.success('删除成功');
      await refreshList();
    } catch (error) {
      showMutationError(message, error);
    }
  };

  const fullColumns: ColumnsType<AdminRole> = [
    { title: '角色名', dataIndex: 'name', key: 'name' },
    { title: '编码', dataIndex: 'code', key: 'code' },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '权限点',
      dataIndex: 'permissionCodes',
      key: 'permissionCodes',
      render: (codes: string[], row: { code: string }) => {
        // 超级管理员拥有全部权限（后期权限点会很多，不逐一展示）
        if (row.code === SUPER_ADMIN_CODE) {
          return <Tag color="gold">全部权限</Tag>;
        }
        return (
          <Space size={[4, 4]} wrap>
            {codes.map((code) => (
              <Tag
                key={code}
                color={code.endsWith(':list') ? 'blue' : 'default'}
              >
                {code}
              </Tag>
            ))}
          </Space>
        );
      },
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
              <Popconfirm
                title="确认删除该角色？"
                onConfirm={() => handleRemove(role.id)}
              >
                <Button color="danger" variant="link" size="small">
                  删除
                </Button>
              </Popconfirm>
            )}
            {!canUpdate && !canDelete && (
              <Typography.Text type="secondary">无权限</Typography.Text>
            )}
            {isSuperAdmin && (
              <Typography.Text type="secondary">内置角色</Typography.Text>
            )}
          </Space>
        );
      },
    },
  ];

  // 列控制 + 导出（共享 hook，行为与既有实现一致：操作列固定、至少保留一列、导可见列）
  const { columnMenuItems, columns, handleExport } =
    useColumnControl<AdminRole>({
      fullColumns,
      initialVisibleKeys: [
        'name',
        'code',
        'description',
        'permissionCodes',
        'enabled',
        'actions',
      ],
      exportFileNamePrefix: '角色管理',
      exportData: filteredRoles,
      exportCell: (key, role) => {
        if (key === 'enabled') return role.enabled ? '正常' : '禁用';
        if (key === 'permissionCodes') {
          return role.code === SUPER_ADMIN_CODE
            ? '全部权限'
            : role.permissionCodes.join(' / ');
        }
        return undefined;
      },
    });

  return (
    <div>
      {/* 搜索卡：独立 Card 位于列表正上方（列表页规范） */}
      <SearchBar
        fields={[
          {
            name: 'keyword',
            label: '关键词',
            type: 'input',
            placeholder: '按角色名 / 编码搜索',
          },
        ]}
        onSearch={(values: SearchValues) =>
          setKeyword((values.keyword as string | undefined) ?? '')
        }
        onReset={() => setKeyword('')}
      />

      {/* 表格卡：标题 + 工具条（新建 / 列控制 / 导出 / 刷新） */}
      <Card
        title="角色列表"
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
                  新建角色
                </Button>
              )
            }
          />
        }
      >
        <Table<AdminRole>
          rowKey="id"
          columns={columns}
          dataSource={filteredRoles}
          loading={loading}
          locale={{ emptyText: '暂无数据' }}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingId === null ? '新建角色' : '编辑角色'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={createLoading || updateLoading || deleteLoading}
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
            <Input.TextArea
              rows={2}
              placeholder="角色职责说明（可选）"
              maxLength={255}
              showCount
            />
          </Form.Item>
          <Form.Item
            label="权限点"
            name="permissionCodes"
            extra={
              editingRoleCode === SUPER_ADMIN_CODE
                ? '超级管理员拥有全部权限，无需单独配置'
                : undefined
            }
          >
            <Select
              mode="multiple"
              options={permissionOptions}
              placeholder="勾选该角色可访问的菜单与操作"
              optionFilterProp="label"
              disabled={editingRoleCode === SUPER_ADMIN_CODE}
            />
          </Form.Item>
          {editingId !== null && (
            <Form.Item
              label="启用"
              name="enabled"
              valuePropName="checked"
              extra={
                editingRoleCode === SUPER_ADMIN_CODE
                  ? '内置超管角色不允许禁用'
                  : undefined
              }
            >
              <Switch disabled={editingRoleCode === SUPER_ADMIN_CODE} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
