import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { EllipsisOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SysDictItem, SysDictType } from '@starter/api-client';
import {
  useCreateDictItemMutation,
  useCreateDictTypeMutation,
  useDeleteDictItemMutation,
  useDeleteDictTypeMutation,
  useSysDictTypesQuery,
  useUpdateDictItemMutation,
  useUpdateDictTypeMutation,
} from '../../../generated/graphql';
import { usePermission } from '../../../app/auth/use-permission.js';

const { Text } = Typography;

interface DictTypeFormValues {
  code: string;
  name: string;
  remark?: string;
  enabled: boolean;
  sort: number;
}

interface DictItemFormValues {
  label: string;
  value: string;
  remark?: string;
  enabled: boolean;
  sort: number;
}

/** 字典管理页（对标 antd 通用字典管理）：左类型列表 + 右字典项表格 */
export function SysDictPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<SysDictType | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SysDictItem | null>(null);

  const [typeForm] = Form.useForm<DictTypeFormValues>();
  const [itemForm] = Form.useForm<DictItemFormValues>();

  const canUpdate = usePermission('config:dict:update');

  const { data, loading, refetch } = useSysDictTypesQuery({
    fetchPolicy: 'network-only',
  });
  const [createDictType] = useCreateDictTypeMutation();
  const [updateDictType] = useUpdateDictTypeMutation();
  const [deleteDictType] = useDeleteDictTypeMutation();
  const [createDictItem] = useCreateDictItemMutation();
  const [updateDictItem] = useUpdateDictItemMutation();
  const [deleteDictItem] = useDeleteDictItemMutation();

  const types = useMemo(
    () => (data?.sysDictTypes ?? []) as SysDictType[],
    [data],
  );
  const selected = useMemo(
    () => types.find((t) => t.id === selectedId) ?? null,
    [types, selectedId],
  );

  // 默认选中第一个
  useEffect(() => {
    if (!selectedId && types.length > 0) {
      setSelectedId(types[0]!.id);
    }
  }, [types, selectedId]);

  const load = useCallback(async () => {
    await refetch();
  }, [refetch]);

  /** 字典类型：新建 */
  const openCreateType = (): void => {
    setEditingType(null);
    typeForm.resetFields();
    typeForm.setFieldsValue({ enabled: true, sort: 0 });
    setTypeModalOpen(true);
  };

  /** 字典类型：编辑 */
  const openEditType = (type: SysDictType): void => {
    setEditingType(type);
    typeForm.setFieldsValue({
      code: type.code,
      name: type.name,
      remark: type.remark ?? undefined,
      enabled: type.enabled,
      sort: type.sort,
    });
    setTypeModalOpen(true);
  };

  /** 字典类型：提交 */
  const handleTypeSubmit = async (): Promise<void> => {
    try {
      await typeForm.validateFields();
    } catch {
      return;
    }
    const values = typeForm.getFieldsValue();
    try {
      if (editingType) {
        const { code: _code, ...rest } = values;
        await updateDictType({
          variables: {
            id: editingType.id,
            input: { ...rest, enabled: rest.enabled ?? true },
          },
        });
        void message.success('字典类型已更新');
      } else {
        await createDictType({
          variables: { input: { ...values, enabled: values.enabled ?? true } },
        });
        void message.success('字典类型已创建');
      }
      setTypeModalOpen(false);
      await load();
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : '操作失败，请重试',
      );
    }
  };

  const handleDeleteType = async (type: SysDictType): Promise<void> => {
    try {
      await deleteDictType({ variables: { id: type.id } });
      void message.success('字典类型已删除');
      if (selectedId === type.id) {
        setSelectedId(null);
      }
      await load();
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : '删除失败，请重试',
      );
    }
  };

  /** 字典项：新建 */
  const openCreateItem = (): void => {
    setEditingItem(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({ enabled: true, sort: 0 });
    setItemModalOpen(true);
  };

  /** 字典项：编辑 */
  const openEditItem = (item: SysDictItem): void => {
    setEditingItem(item);
    itemForm.setFieldsValue({
      label: item.label,
      value: item.value,
      remark: item.remark ?? undefined,
      enabled: item.enabled,
      sort: item.sort,
    });
    setItemModalOpen(true);
  };

  /** 字典项：提交 */
  const handleItemSubmit = async (): Promise<void> => {
    if (!selected) return;
    try {
      await itemForm.validateFields();
    } catch {
      return;
    }
    const values = itemForm.getFieldsValue();
    try {
      if (editingItem) {
        const { value: _value, ...rest } = values;
        await updateDictItem({
          variables: {
            id: editingItem.id,
            input: { ...rest, enabled: rest.enabled ?? true },
          },
        });
        void message.success('字典项已更新');
      } else {
        await createDictItem({
          variables: {
            input: {
              ...values,
              dictTypeId: selected.id,
              enabled: values.enabled ?? true,
            },
          },
        });
        void message.success('字典项已创建');
      }
      setItemModalOpen(false);
      await load();
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : '操作失败，请重试',
      );
    }
  };

  const handleDeleteItem = async (id: string): Promise<void> => {
    try {
      await deleteDictItem({ variables: { id } });
      void message.success('字典项已删除');
      await load();
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : '删除失败，请重试',
      );
    }
  };

  const itemColumns: ColumnsType<SysDictItem> = [
    {
      title: '标签',
      dataIndex: 'label',
      key: 'label',
      width: 160,
      render: (v: string, record) => (
        <Space size="small">
          <Text>{v}</Text>
          {!record.enabled && <Tag color="default">已禁用</Tag>}
        </Space>
      ),
    },
    {
      title: '值',
      dataIndex: 'value',
      key: 'value',
      width: 200,
      render: (v: string) => (
        <Text
          style={{ fontFamily: 'monospace', fontSize: 12 }}
          copyable={{ text: v }}
        >
          {v}
        </Text>
      ),
    },
    {
      title: '排序',
      dataIndex: 'sort',
      key: 'sort',
      width: 70,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_v, record) => (
        <Space size="small">
          {canUpdate && (
            <>
              <Button
                type="link"
                size="small"
                onClick={() => openEditItem(record)}
              >
                编辑
              </Button>
              <Popconfirm
                title="确认删除该字典项？"
                onConfirm={() => void handleDeleteItem(record.id)}
              >
                <Button color="red" variant="link" size="small">
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
          {!canUpdate && <Text type="secondary">只读</Text>}
        </Space>
      ),
    },
  ];

  return (
    <Row gutter={16}>
      {/* 左：字典类型列表 */}
      <Col xs={24} md={8} lg={7}>
        <Card
          title="字典类型"
          loading={loading}
          extra={
            canUpdate && (
              <Button type="primary" size="small" onClick={openCreateType}>
                新建
              </Button>
            )
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {types.map((type) => (
              <div
                key={type.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border:
                    selectedId === type.id
                      ? '1px solid #1677ff'
                      : '1px solid transparent',
                  background:
                    selectedId === type.id
                      ? 'rgba(22,119,255,0.06)'
                      : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(type.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Text strong>{type.name}</Text>
                    {!type.enabled && <Tag color="default">禁用</Tag>}
                  </div>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, fontFamily: 'monospace' }}
                  >
                    {type.code} · {type.items.length} 项
                  </Text>
                </button>
                {canUpdate && (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'edit', label: '编辑' },
                        { key: 'delete', label: '删除', danger: true },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'edit') {
                          openEditType(type);
                        } else if (key === 'delete') {
                          handleDeleteType(type).catch(() => undefined);
                        }
                      },
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<EllipsisOutlined />}
                      aria-label="操作"
                    />
                  </Dropdown>
                )}
              </div>
            ))}
            {types.length === 0 && !loading && (
              <Text
                type="secondary"
                style={{ textAlign: 'center', padding: 24 }}
              >
                暂无字典类型
              </Text>
            )}
          </div>
        </Card>
      </Col>

      {/* 右：字典项表格 */}
      <Col xs={24} md={16} lg={17}>
        <Card
          title={selected ? `${selected.name}（字典项）` : '字典项'}
          loading={loading}
          extra={
            canUpdate &&
            selected && (
              <Button type="primary" size="small" onClick={openCreateItem}>
                新建字典项
              </Button>
            )
          }
        >
          {selected ? (
            <Table<SysDictItem>
              rowKey="id"
              columns={itemColumns}
              dataSource={(selected.items ?? []) as SysDictItem[]}
              pagination={false}
              size="small"
            />
          ) : (
            <Text type="secondary">请先选择左侧字典类型</Text>
          )}
        </Card>
      </Col>

      {/* 字典类型 Modal */}
      <Modal
        title={editingType ? '编辑字典类型' : '新建字典类型'}
        open={typeModalOpen}
        onOk={() => void handleTypeSubmit()}
        onCancel={() => setTypeModalOpen(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={typeForm} layout="vertical">
          <Form.Item
            label="字典编码"
            name="code"
            rules={[{ required: true, message: '请输入字典编码' }]}
            extra="机器可读编码，如 audit_action（创建后不可修改）"
          >
            <Input placeholder="如 audit_action" disabled={!!editingType} />
          </Form.Item>
          <Form.Item
            label="字典名称"
            name="name"
            rules={[{ required: true, message: '请输入字典名称' }]}
          >
            <Input placeholder="如 审计操作类型" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="排序" name="sort">
                <InputNumber min={0} max={9999} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="启用" name="enabled" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 字典项 Modal */}
      <Modal
        title={editingItem ? '编辑字典项' : '新建字典项'}
        open={itemModalOpen}
        onOk={() => void handleItemSubmit()}
        onCancel={() => setItemModalOpen(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item
            label="标签"
            name="label"
            rules={[{ required: true, message: '请输入标签' }]}
            extra="展示用名称，如 登录成功"
          >
            <Input placeholder="如 登录成功" />
          </Form.Item>
          <Form.Item
            label="值"
            name="value"
            rules={[{ required: true, message: '请输入值' }]}
            extra="存储用值，如 login_success（创建后不可修改）"
          >
            <Input placeholder="如 login_success" disabled={!!editingItem} />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="排序" name="sort">
                <InputNumber min={0} max={9999} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="启用" name="enabled" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Row>
  );
}
