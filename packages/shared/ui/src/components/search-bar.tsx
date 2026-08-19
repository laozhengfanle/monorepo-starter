import {
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  Row,
  Select,
  Space,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

const { RangePicker } = DatePicker;

/** 搜索字段类型 */
export type SearchFieldType = 'input' | 'select' | 'dateRange' | 'checkbox';

/** 搜索字段配置 */
export interface SearchField {
  /** 表单字段名（提交 values 的 key） */
  name: string;
  /** 标签（label） */
  label: string;
  /** 控件类型 */
  type: SearchFieldType;
  /** placeholder（input/select 用） */
  placeholder?: string;
  /** 输入框前缀图标（仅 input 用）：缺省时自动加 SearchOutlined，传 null 去掉 */
  prefix?: ReactNode;
  /** Select 选项 */
  options?: { value: string; label: string }[];
  /** 默认值（initialValue） */
  initialValue?: unknown;
  /** Checkbox 的 label 文案（type=checkbox 用） */
  checkLabel?: string;
  /** 栅格列宽（24 栅格）。默认 6（桌面端一行 4 个）；dateRange 默认 8 */
  span?: number;
}

/** 查询回调收到的值（泛型由页面自行断言） */
export type SearchValues = Record<string, unknown>;

export interface SearchBarProps {
  /** 搜索字段配置数组 */
  fields: SearchField[];
  /** 点击「查询」回调（页面负责 setPage(1) + 更新筛选状态） */
  onSearch: (values: SearchValues) => void;
  /** 点击「重置」回调（组件已 resetFields，页面负责清空查询状态 + setPage(1)） */
  onReset?: () => void;
}

/** 标签统一宽度：保证各字段输入框起始位置对齐（antd Select 无默认宽度，控件由栅格列撑满） */
const LABEL_WIDTH = 72;
/** 普通字段栅格列宽（24 栅格，桌面端一行 4 个） */
const FIELD_SPAN = 6;
/** 时间范围字段列宽（带时间的 RangePicker 较宽） */
const DATE_RANGE_SPAN = 8;

/**
 * 列表页搜索栏（统一规范，见 docs/02-开发规范/列表页规范.md）：
 * - 独立 Card 位于列表正上方，与列表 Card 间距 marginBottom: 16
 * - Row/Col 栅格布局：字段、checkbox、按钮都是栅格项，控件 width:100% 填满列，天然等宽且响应式换行
 * - 标签统一宽度（labelCol 72px）；checkbox 与按钮用空 label 占位，与上方 input 对齐
 * - 按钮是栅格流内最后一个（左对齐）
 * - 查询/重置按钮均不带 icon（统一）
 * - 重置语义：组件内部 resetFields() + 透传 onReset（页面清状态 + setPage(1)）
 */
export function SearchBar({
  fields,
  onSearch,
  onReset,
}: SearchBarProps): React.JSX.Element {
  const [form] = Form.useForm<SearchValues>();

  const handleReset = (): void => {
    form.resetFields();
    onReset?.();
  };

  const renderField = (field: SearchField): ReactNode => {
    switch (field.type) {
      case 'select':
        return (
          <Select
            allowClear
            placeholder={field.placeholder ?? '全部'}
            options={field.options}
            style={{ width: '100%' }}
          />
        );
      case 'dateRange':
        return <RangePicker showTime style={{ width: '100%' }} />;
      case 'checkbox':
        return <Checkbox>{field.checkLabel ?? field.label}</Checkbox>;
      case 'input':
      default:
        return (
          <Input
            allowClear
            // 输入类字段默认带搜索图标（搜索语义：用户名/关键词/Pattern 等）；
            // 页面传 prefix 可覆盖，传 prefix={null} 可显式去掉
            prefix={
              field.prefix !== undefined ? field.prefix : <SearchOutlined />
            }
            placeholder={field.placeholder ?? `请输入${field.label}`}
            autoComplete="off"
            style={{ width: '100%' }}
          />
        );
    }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <Form
        form={form}
        labelCol={{ flex: `0 0 ${LABEL_WIDTH}px` }}
        // 全站规范：label 一律不加冒号（antd 默认 colon，显式关闭）
        colon={false}
        onFinish={(values) => onSearch(values as SearchValues)}
      >
        <Row gutter={[12, 12]}>
          {fields.map((field) => (
            <Col
              key={field.name}
              xs={24}
              sm={12}
              xl={
                field.span ??
                (field.type === 'dateRange' ? DATE_RANGE_SPAN : FIELD_SPAN)
              }
            >
              <Form.Item
                name={field.name}
                label={field.type === 'checkbox' ? ' ' : field.label}
                colon={field.type === 'checkbox' ? false : undefined}
                valuePropName={
                  field.type === 'checkbox' ? 'checked' : undefined
                }
                style={{ marginBottom: 0 }}
                initialValue={field.initialValue}
              >
                {renderField(field)}
              </Form.Item>
            </Col>
          ))}
          {/* 按钮：栅格流内最后一个（左对齐，空 label 与 input 对齐） */}
          <Col xs={24} sm={12} xl={6}>
            <Form.Item label=" " colon={false} style={{ marginBottom: 0 }}>
              <Space size="small">
                <Button type="primary" htmlType="submit">
                  查询
                </Button>
                <Button onClick={handleReset}>重置</Button>
              </Space>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}

export default SearchBar;
