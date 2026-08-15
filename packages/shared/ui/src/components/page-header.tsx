import { Space, Typography } from 'antd';
import type { ReactNode } from 'react';

export interface BreadcrumbItem {
  title: ReactNode;
  href?: string;
}

interface PageHeaderProps {
  /** 页面标题 */
  title: ReactNode;
  /** 面包屑（可选，通常由布局根据菜单树生成） */
  breadcrumb?: BreadcrumbItem[];
  /** 右侧操作区（新建按钮等） */
  extra?: ReactNode;
  /** 标题下方描述（可选） */
  description?: ReactNode;
}

/**
 * 页面头：面包屑 + 标题 + 右侧操作区。
 * 用于统一各管理页的标题区，替代各自为政的 Typography.Title。
 */
export function PageHeader({ title, breadcrumb, extra, description }: PageHeaderProps): React.JSX.Element {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {breadcrumb && breadcrumb.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {breadcrumb.map((item, index) => (
                  <span key={index}>
                    {index > 0 && <span style={{ margin: '0 8px' }}>/</span>}
                    {item.title}
                  </span>
                ))}
              </Typography.Text>
            </div>
          )}
          <Typography.Title level={4} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {description && (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {description}
            </Typography.Text>
          )}
        </div>
        {extra && <Space>{extra}</Space>}
      </div>
    </div>
  );
}
