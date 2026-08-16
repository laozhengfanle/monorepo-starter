import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('渲染标题', () => {
    render(<PageHeader title="账户管理" />);
    expect(screen.getByText('账户管理')).toBeTruthy();
  });

  it('渲染面包屑', () => {
    render(
      <PageHeader
        title="角色权限管理"
        breadcrumb={[{ title: '权限中心' }, { title: '角色权限' }]}
      />,
    );
    expect(screen.getByText('权限中心')).toBeTruthy();
    expect(screen.getAllByText(/角色权限/).length).toBeGreaterThan(0);
  });

  it('渲染描述与右侧操作区', () => {
    render(<PageHeader title="审计日志" description="操作留痕" extra={<button>导出</button>} />);
    expect(screen.getByText('操作留痕')).toBeTruthy();
    expect(screen.getByText('导出')).toBeTruthy();
  });
});
