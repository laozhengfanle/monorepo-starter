import { useState } from 'react';
import { App, Checkbox } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { downloadBlob, toCSV, toExcel } from '../utils/export.js';

/** 导出单元格取值（与 export.ts 的 toCSV/toExcel 行类型一致） */
export type ExportCellValue = string | number | boolean | null | undefined;

export interface ColumnControlOptions<TRow> {
  /** 全部列定义（含操作列；每列必须有唯一 key） */
  fullColumns: ColumnsType<TRow>;
  /** 初始可见列 key */
  initialVisibleKeys: string[];
  /** 导出文件名前缀（如「账户管理」→ 账户管理_20240101120000.csv） */
  exportFileNamePrefix: string;
  /** 导出数据源（当前筛选/过滤后的行，保持与表格展示一致） */
  exportData: TRow[];
  /**
   * 导出单元格自定义取值：返回 undefined 时回退到 dataIndex（无则 key）取值。
   * 用于把布尔/枚举/对象列渲染成可读文本（如 status → 正常/禁用）。
   */
  exportCell?: (key: string, row: TRow) => ExportCellValue;
}

export interface ColumnControl<TRow> {
  visibleKeys: Set<string>;
  /** 切换列显隐（操作列固定显示，至少保留一列） */
  toggleColumn: (key: string) => void;
  /** 列控制下拉菜单项（Checkbox 列表） */
  columnMenuItems: { key: string; label: React.JSX.Element }[];
  /** 按可见列过滤后的列定义（直接传给 Table columns） */
  columns: ColumnsType<TRow>;
  /** 导出 Excel / CSV（仅导出可见列，排除操作列；含公式注入转义） */
  handleExport: (format: 'excel' | 'csv') => void;
}

/**
 * 列表页列控制 + 导出共享逻辑（admin-accounts / admin-roles / admin-menus 三页复用）。
 * 行为与原三页逐行一致：
 * - 列控制：Checkbox 菜单切换显隐，操作列（key='actions'）固定显示，至少保留一列
 * - 导出：只导可见列（去操作列），自定义列值走 exportCell，其余按 dataIndex/key 取值，
 *   文件名「前缀_yyyyMMddHHmm」+ .xls/.csv，导出条数 = exportData.length
 */
export function useColumnControl<TRow>(
  options: ColumnControlOptions<TRow>,
): ColumnControl<TRow> {
  const { message } = App.useApp();
  const {
    fullColumns,
    initialVisibleKeys,
    exportFileNamePrefix,
    exportData,
    exportCell,
  } = options;

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(initialVisibleKeys),
  );

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

  const handleExport = (format: 'excel' | 'csv'): void => {
    const exportCols = fullColumns.filter(
      (c) => visibleKeys.has(c.key as string) && c.key !== 'actions',
    );
    const header = exportCols.map((c) => String(c.title));
    const rows: ExportCellValue[][] = [
      header,
      ...exportData.map((row) =>
        exportCols.map((c) => {
          const key = c.key as string;
          const custom = exportCell?.(key, row);
          if (custom !== undefined) return custom;
          const dataIdx = (c as { dataIndex?: string }).dataIndex ?? key;
          const v = (row as unknown as Record<string, unknown>)[dataIdx];
          return (v as ExportCellValue) ?? '';
        }),
      ),
    ];
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    if (format === 'excel') {
      downloadBlob(
        toExcel(rows),
        `${exportFileNamePrefix}_${ts}.xls`,
        'application/vnd.ms-excel;charset=utf-8;',
      );
    } else {
      downloadBlob(
        toCSV(rows),
        `${exportFileNamePrefix}_${ts}.csv`,
        'text/csv;charset=utf-8;',
      );
    }
    void message.success(`已导出 ${exportData.length} 条`);
  };

  return { visibleKeys, toggleColumn, columnMenuItems, columns, handleExport };
}
