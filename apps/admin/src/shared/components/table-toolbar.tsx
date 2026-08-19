import { Button, Dropdown, Space } from 'antd';
import {
  DeliveredProcedureOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FilterOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import type { ColumnControl } from '../hooks/use-column-control.js';
import { usePermission } from '../../app/auth/use-permission.js';

/** 导出按钮的全局权限点（seed 全局权限分组 global:data:export；所有表格页统一生效） */
export const EXPORT_PERMISSION = 'global:data:export';

export type ExportFormat = 'excel' | 'csv';

export interface TableToolbarProps {
  /**
   * useColumnControl 返回的列控制菜单项；表格三要素之一（列控制/导出/刷新），
   * 所有列表页必须传入（操作列固定、至少保留一列）。
   */
  columnMenuItems?: ColumnControl<unknown>['columnMenuItems'];
  /**
   * 导出回调（key 为 excel/csv）。不传则隐藏导出按钮。
   * 传 formats: ['csv'] 时渲染单个「导出」按钮（适合只支持 CSV 的页面，如审计日志/文件列表）。
   */
  onExport?: (format: ExportFormat) => void;
  /** 支持的导出格式，默认 ['excel', 'csv']（多个格式时渲染下拉菜单） */
  exportFormats?: ExportFormat[];
  /** 刷新回调（点击触发重新拉取列表） */
  onRefresh?: () => void | Promise<void>;
  /** 额外按钮，渲染在工具条最左侧（如「新建账户」「清空日志」等页面主操作） */
  extra?: React.ReactNode;
}

/**
 * 列表页表格工具条规范组件（全站统一）：
 *   [额外按钮…] [列控制] [导出] [刷新]
 * - 列控制：Checkbox 下拉菜单（由 useColumnControl 提供，操作列固定、至少保留一列）
 * - 导出：excel/csv 下拉（单一格式时渲染单个按钮），图标 DeliveredProcedureOutlined；
 *   受全局权限点 global:data:export 控制（super_admin 隐式拥有；无权限则隐藏导出按钮）
 * - 刷新：RedoOutlined 图标按钮
 * 规范见 docs/02-开发规范/表格规范.md
 */
export function TableToolbar({
  columnMenuItems,
  onExport,
  exportFormats = ['excel', 'csv'],
  onRefresh,
  extra,
}: TableToolbarProps): React.JSX.Element {
  const canExport = usePermission(EXPORT_PERMISSION);
  const exportItems = exportFormats.map((format) => ({
    key: format,
    label: format === 'excel' ? '导出 Excel' : '导出 CSV',
    icon: format === 'excel' ? <FileExcelOutlined /> : <FileTextOutlined />,
  }));

  return (
    <Space size="small">
      {extra}
      {columnMenuItems && (
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
      )}
      {onExport &&
        canExport &&
        (exportFormats.length > 1 ? (
          <Dropdown
            trigger={['click']}
            arrow
            menu={{
              items: exportItems,
              onClick: ({ key }) => onExport(key as ExportFormat),
            }}
          >
            <Button icon={<DeliveredProcedureOutlined />} aria-label="导出" />
          </Dropdown>
        ) : (
          <Button
            icon={<DeliveredProcedureOutlined />}
            aria-label="导出"
            onClick={() => onExport(exportFormats[0])}
          />
        ))}
      {onRefresh && (
        <Button
          icon={<RedoOutlined />}
          onClick={() => void onRefresh()}
          aria-label="刷新"
        />
      )}
    </Space>
  );
}
