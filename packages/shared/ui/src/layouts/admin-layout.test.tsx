import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminLayout } from './admin-layout';

describe('AdminLayout', () => {
  it('渲染侧栏、页头与内容区', () => {
    render(
      <AdminLayout title="测试标题">
        <p>页面内容</p>
      </AdminLayout>
    );

    expect(screen.getByText('测试标题')).toBeInTheDocument();
    expect(screen.getByText('页面内容')).toBeInTheDocument();
    expect(document.querySelector('.ant-layout-sider')).toBeInTheDocument();
  });

  it('点击折叠按钮切换侧栏折叠状态', async () => {
    const user = userEvent.setup();
    render(<AdminLayout title="t">内容</AdminLayout>);

    const sider = document.querySelector('.ant-layout-sider');
    expect(sider).not.toHaveClass('ant-layout-sider-collapsed');

    await user.click(document.querySelector('.ant-layout-sider-trigger') as Element);

    expect(sider).toHaveClass('ant-layout-sider-collapsed');
  });
});
