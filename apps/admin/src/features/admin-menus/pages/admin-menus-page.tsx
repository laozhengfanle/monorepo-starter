import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TreeSelect,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeliveredProcedureOutlined,
  FilterOutlined,
  PlusOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { ApolloError } from '@apollo/client';
import { CreateMenuSchema, UpdateMenuSchema } from '@starter/api-client';

import type { MenuType } from '@starter/api-client';
import { usePermission } from '../../../app/auth/use-permission.js';
import { downloadBlob, toCSV } from '../../../shared/utils/export.js';
import { useAuth } from '../../../app/auth/auth-context.js';
import {
  useMenuTreeQuery,
  useCreateMenuMutation,
  useUpdateMenuMutation,
  useDeleteMenuMutation,
} from '../../../generated/graphql';
import type { CreateMenuInput, UpdateMenuInput } from '../../../generated/graphql';

const TYPE_LABELS: Record<string, string> = {
  directory: '目录',
  menu: '菜单',
  button: '按钮',
};

/** 收集所有有子节点的菜单 id（用于默认展开） */
function collectParentIds(nodes: MenuRowItem[]): string[] {
  const keys: string[] = [];
  const walk = (list: MenuRowItem[]): void => {
    for (const n of list) {
      if (n.children?.length) {
        keys.push(n.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

/** 菜单树行的最小结构（兼容 codegen 生成的查询结果类型） */
interface MenuRowItem {
  id: string;
  parentId?: string | null;
  name: string;
  code: string;
  type: string;
  path?: string | null;
  icon?: string | null;
  sort: number;
  enabled: boolean;
  children?: MenuRowItem[];
}

/** 预设图标（与侧栏 ICON_MAP 保持一致） */
const ICON_OPTIONS = [
  { value: 'TeamOutlined', label: 'TeamOutlined（团队）' },
  { value: 'UserOutlined', label: 'UserOutlined（用户）' },
  { value: 'SafetyOutlined', label: 'SafetyOutlined（安全）' },
  { value: 'MenuOutlined', label: 'MenuOutlined（菜单）' },
  { value: 'SettingOutlined', label: 'SettingOutlined（设置）' },
  { value: 'DashboardOutlined', label: 'DashboardOutlined（仪表盘）' },
  { value: 'FileOutlined', label: 'FileOutlined（文件）' },
  { value: 'AppstoreOutlined', label: 'AppstoreOutlined（应用）' },
];

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

/** 菜单树 → TreeSelect 数据；按 allowedTypes 过滤可选的父节点（祖先链保留但禁用） */
function toTreeSelectData(
  nodes: MenuRowItem[],
  allowedTypes: MenuType[] | null,
): { value: string; title: string; disabled?: boolean; children: ReturnType<typeof toTreeSelectData> }[] {
  return nodes
    .map((n) => {
      const children = toTreeSelectData(n.children ?? [], allowedTypes);
      const selfMatch = allowedTypes ? allowedTypes.includes(n.type as MenuType) : true;
      // 自身不匹配但存在匹配后代时：保留为禁用节点（展示层级，不可选为父）
      if (!selfMatch && children.length === 0) {
        return null;
      }
      return {
        value: n.id,
        title: `${n.name}（${TYPE_LABELS[n.type] ?? n.type}）`,
        disabled: !selfMatch,
        children,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/**
 * 菜单/权限点管理页：树形表格 + 新建/编辑/删除。
 * 菜单与权限同一张表：目录(directory) → 菜单(menu) → 按钮(button，权限点)。
 */
export function AdminMenusPage(): React.JSX.Element {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(['name', 'code', 'type', 'path', 'icon', 'sort', 'enabled', 'actions']),
  );
  const [form] = Form.useForm();
  const menuType = Form.useWatch('type', form) as MenuType | undefined;

  const canCreate = usePermission('menu:create');
  const canUpdate = usePermission('menu:update');
  const canDelete = usePermission('menu:delete');
  const { refreshMe } = useAuth();

  const { data, loading, refetch } = useMenuTreeQuery();
  const [createMenu, { loading: createLoading }] = useCreateMenuMutation();
  const [updateMenu, { loading: updateLoading }] = useUpdateMenuMutation();
  const [deleteMenu, { loading: deleteLoading }] = useDeleteMenuMutation();

  const tree = useMemo(() => data?.menuTree ?? [], [data]);

  // 数据异步加载后默认全展开（defaultExpandAllRows 只对首次渲染生效）
  const [expandedKeys, setExpandedKeys] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    if (tree.length > 0 && expandedKeys === undefined) {
      setExpandedKeys(collectParentIds(tree));
    }
  }, [tree, expandedKeys]);

  // TreeSelect 展开态（异步数据下 treeDefaultExpandAll 不生效，改为受控）
  const [treeExpandedKeys, setTreeExpandedKeys] = useState<(string | number)[]>([]);

  const refreshList = async (): Promise<void> => {
    await refetch();
  };

  const openCreate = (): void => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ type: 'menu', sort: 1, enabled: true });
    setTreeExpandedKeys(collectParentIds(tree));
    setModalOpen(true);
  };

  const openEdit = (node: MenuRowItem): void => {
    setEditingId(node.id);
    form.setFieldsValue({
      parentId: node.parentId ?? undefined,
      name: node.name,
      type: node.type,
      path: node.path ?? undefined,
      icon: node.icon ?? undefined,
      sort: node.sort,
      enabled: node.enabled,
    });
    setTreeExpandedKeys(collectParentIds(tree));
    setModalOpen(true);
  };

  const handleSubmit = async (): Promise<void> => {
    const values = form.getFieldsValue();
    const schema = editingId === null ? CreateMenuSchema : UpdateMenuSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(form, parsed);
      return;
    }
    try {
      if (editingId === null) {
        await createMenu({
          variables: { input: parsed.data as unknown as CreateMenuInput },
        });
        void message.success('创建成功');
      } else {
        await updateMenu({
          variables: { id: editingId, input: parsed.data as unknown as UpdateMenuInput },
        });
        void message.success('更新成功');
      }
      setModalOpen(false);
      form.resetFields();
      await refreshList();
      await refreshMe();
    } catch (error) {
      showMutationError(error);
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await deleteMenu({ variables: { id } });
      void message.success('删除成功');
      await refreshList();
      await refreshMe();
    } catch (error) {
      showMutationError(error);
    }
  };

  // 父节点可选范围：button 只能挂 menu 下；menu/directory 只能挂 directory 下
  let parentAllowedTypes: MenuType[] | null = null;
  if (menuType === 'button') {
    parentAllowedTypes = ['menu'];
  } else if (menuType === 'directory' || menuType === 'menu') {
    parentAllowedTypes = ['directory'];
  }
  const parentOptions = toTreeSelectData(tree, parentAllowedTypes);

  const fullColumns: ColumnsType<MenuRowItem> = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '编码', dataIndex: 'code', key: 'code' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => {
        const color = type === 'directory' ? 'gold' : type === 'menu' ? 'blue' : 'default';
        return <Tag color={color}>{TYPE_LABELS[type] ?? type}</Tag>;
      },
    },
    { title: '路由', dataIndex: 'path', key: 'path', render: (p: string | null) => p ?? '-' },
    { title: '图标', dataIndex: 'icon', key: 'icon', render: (i: string | null) => i ?? '-' },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 70 },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 70,
      render: (enabled: boolean) => (enabled ? '是' : '否'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_value, node) => (
        <Space>
          {canUpdate && (
            <Button type="link" size="small" onClick={() => openEdit(node)}>
              编辑
            </Button>
          )}
          {canDelete && (node.children?.length ?? 0) === 0 && (
            <Popconfirm
              title="确认删除该菜单/权限点？角色将同时失去该权限"
              onConfirm={() => handleRemove(node.id)}
            >
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

  // 树形数据扁平化（导出用）
  const flattenTree = (nodes: MenuRowItem[], acc: MenuRowItem[] = []): MenuRowItem[] => {
    for (const n of nodes) {
      acc.push(n);
      if (n.children?.length) flattenTree(n.children, acc);
    }
    return acc;
  };

  const handleExport = (): void => {
    const exportCols = fullColumns.filter((c) => visibleKeys.has(c.key as string) && c.key !== 'actions');
    const header = exportCols.map((c) => String(c.title));
    const rows: (string | number | boolean | null | undefined)[][] = [
      header,
      ...flattenTree(tree).map((n) =>
        exportCols.map((c) => {
          if (c.key === 'enabled') return n.enabled ? '正常' : '禁用';
          if (c.key === 'type') return TYPE_LABELS[n.type] ?? n.type;
          const dataIdx = (c as { dataIndex?: string }).dataIndex ?? (c.key as string);
          const v = (n as unknown as Record<string, unknown>)[dataIdx];
          return (v as string | number | boolean | null | undefined) ?? '';
        }),
      ),
    ];
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    downloadBlob(toCSV(rows), `菜单管理_${ts}.csv`, 'text/csv;charset=utf-8;');
    void message.success(`已导出 ${flattenTree(tree).length} 条`);
  };

  return (
    <div>
      <Card
        title="菜单树"
        extra={
          <Space size="small">
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新建菜单
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
      <Table<MenuRowItem>
        rowKey="id"
        columns={columns}
        dataSource={tree}
        loading={loading}
        locale={{ emptyText: '暂无数据' }}
        pagination={false}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
        }}
      />
      </Card>

      <Modal
        title={editingId === null ? '新建菜单' : '编辑菜单'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={createLoading || updateLoading || deleteLoading}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="上级" name="parentId">
            <TreeSelect
              treeData={parentOptions}
              placeholder="不选则为顶级（目录）"
              allowClear
              treeExpandedKeys={treeExpandedKeys}
              onTreeExpand={(keys) => setTreeExpandedKeys(keys as (string | number)[])}
            />
          </Form.Item>
          <Form.Item label="名称" name="name">
            <Input placeholder="如：报表中心" />
          </Form.Item>
          {editingId === null && (
            <Form.Item label="编码" name="code" extra="按钮即权限点编码，如 report:list">
              <Input placeholder="小写字母开头，如 report:list" />
            </Form.Item>
          )}
          <Form.Item label="类型" name="type">
            <Radio.Group
              options={[
                { value: 'directory', label: '目录' },
                { value: 'menu', label: '菜单' },
                { value: 'button', label: '按钮' },
              ]}
              optionType="button"
            />
          </Form.Item>
          {menuType === 'menu' && (
            <Form.Item label="路由" name="path" extra="前端页面路径，如 /admin/reports">
              <Input placeholder="/admin/reports" />
            </Form.Item>
          )}
          {menuType !== 'button' && (
            <Form.Item label="图标" name="icon">
              <Select options={ICON_OPTIONS} placeholder="选择侧栏图标（可选）" allowClear />
            </Form.Item>
          )}
          <Form.Item label="排序" name="sort">
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
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
