import { useMemo, useState } from 'react';
import {
  App,
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
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeliveredProcedureOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FilterOutlined,
  PlusOutlined,
  RedoOutlined,
  SearchOutlined,
} from '@ant-design/icons';
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
import { downloadBlob, toCSV, toExcel } from '../../../shared/utils/export.js';
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
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () =>
      new Set([
        'name',
        'code',
        'description',
        'permissionCodes',
        'enabled',
        'actions',
      ]),
  );
  const [form] = Form.useForm();
  const [searchForm] = Form.useForm();

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

  // 导出 CSV：导出过滤后的角色（含可见列）
  const handleExport = (format: 'excel' | 'csv'): void => {
    const exportCols = fullColumns.filter(
      (c) => visibleKeys.has(c.key as string) && c.key !== 'actions',
    );
    const header = exportCols.map((c) => String(c.title));
    const rows: (string | number | boolean | null | undefined)[][] = [
      header,
      ...filteredRoles.map((r) =>
        exportCols.map((c) => {
          if (c.key === 'enabled') return r.enabled ? '正常' : '禁用';
          if (c.key === 'permissionCodes') {
            return r.code === SUPER_ADMIN_CODE
              ? '全部权限'
              : r.permissionCodes.join(' / ');
          }
          const dataIdx =
            (c as { dataIndex?: string }).dataIndex ?? (c.key as string);
          const v = (r as unknown as Record<string, unknown>)[dataIdx];
          return (v as string | number | boolean | null | undefined) ?? '';
        }),
      ),
    ];
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    if (format === 'excel') {
      downloadBlob(
        toExcel(rows),
        `角色管理_${ts}.xls`,
        'application/vnd.ms-excel;charset=utf-8;',
      );
    } else {
      downloadBlob(
        toCSV(rows),
        `角色管理_${ts}.csv`,
        'text/csv;charset=utf-8;',
      );
    }
    void message.success(`已导出 ${filteredRoles.length} 条`);
  };

  return (
    <div>
      {/* 搜索卡 */}
      <Card style={{ marginBottom: 16 }}>
        <Form
          form={searchForm}
          layout="inline"
          onFinish={(values: { keyword?: string }) =>
            setKeyword(values.keyword ?? '')
          }
        >
          <Form.Item name="keyword" label="关键词" style={{ marginBottom: 0 }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="按角色名 / 编码搜索"
              autoComplete="off"
              style={{ width: 280 }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SearchOutlined />}
              >
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
        title="角色列表"
        extra={
          <Space size="small">
            {canCreate && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreate}
              >
                新建角色
              </Button>
            )}
            <Dropdown
              trigger={['click']}
              arrow
              menu={{
                items: columnMenuItems,
                onClick: (info) => info.domEvent.stopPropagation(),
              }}
            >
              <Button icon={<FilterOutlined />} aria-label="列控制" />
            </Dropdown>
            <Dropdown
              trigger={['click']}
              arrow
              menu={{
                items: [
                  {
                    key: 'excel',
                    label: '导出 Excel',
                    icon: <FileExcelOutlined />,
                  },
                  { key: 'csv', label: '导出 CSV', icon: <FileTextOutlined /> },
                ],
                onClick: ({ key }) => handleExport(key as 'excel' | 'csv'),
              }}
            >
              <Button icon={<DeliveredProcedureOutlined />} aria-label="导出" />
            </Dropdown>
            <Button
              icon={<RedoOutlined />}
              onClick={() => void refreshList()}
              aria-label="刷新"
            />
          </Space>
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
