import { createElement } from 'react';
import type { ReactNode } from 'react';
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BookOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOutlined,
  GlobalOutlined,
  KeyOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';

/**
 * 菜单图标单一来源（侧栏渲染 / 仪表盘快捷入口 / 菜单管理下拉共用）。
 * 图标名 ↔ 组件一一对应，杜绝各处自行映射导致的不一致（如 dashboard 曾把 UserOutlined 错映射为 TeamOutlined）。
 */
const ICON_COMPONENTS = {
  TeamOutlined,
  UserOutlined,
  SafetyOutlined,
  MenuOutlined,
  SettingOutlined,
  DashboardOutlined,
  FileOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  GlobalOutlined,
  FileTextOutlined,
  FolderOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  BookOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  CloudUploadOutlined,
  AuditOutlined,
  KeyOutlined,
} as const;

export type MenuIconName = keyof typeof ICON_COMPONENTS;

/** 图标中文名（下拉选项 label 用） */
const ICON_LABELS: Record<MenuIconName, string> = {
  TeamOutlined: '团队',
  UserOutlined: '用户',
  SafetyOutlined: '安全',
  MenuOutlined: '菜单',
  SettingOutlined: '设置',
  DashboardOutlined: '仪表盘',
  FileOutlined: '文件',
  AppstoreOutlined: '应用',
  DeleteOutlined: '删除',
  GlobalOutlined: '全局',
  FileTextOutlined: '文本',
  FolderOutlined: '文件夹',
  ThunderboltOutlined: '闪电',
  SafetyCertificateOutlined: '证书',
  BookOutlined: '书本',
  BarChartOutlined: '图表',
  DatabaseOutlined: '数据库',
  CloudUploadOutlined: '云上传',
  AuditOutlined: '审计',
  KeyOutlined: '密钥',
};

/** 图标下拉选项（菜单管理页 Select） */
export const ICON_OPTIONS = (
  Object.keys(ICON_COMPONENTS) as MenuIconName[]
).map((value) => ({
  value,
  label: `${value}（${ICON_LABELS[value]}）`,
}));

/** 图标名 → antd 图标节点；未知/空返回 null（调用方自行兜底默认图标） */
export function getMenuIcon(name?: string | null): ReactNode {
  if (!name) return null;
  const Cmp = ICON_COMPONENTS[name as MenuIconName];
  return Cmp ? createElement(Cmp) : null;
}
