import { useState } from 'react';
import type { ReactNode } from 'react';
import { Layout } from 'antd';

const { Header, Sider, Content } = Layout;

interface AdminLayoutProps {
  /** 侧栏顶部展示的应用/品牌名 */
  title: string;
  /** 侧栏菜单（通常传入 antd Menu） */
  menu?: ReactNode;
  /** 顶栏右侧内容（如当前用户 + 登出按钮） */
  headerRight?: ReactNode;
  /** 内容区 */
  children: ReactNode;
}

/** 中后台标准布局：可折叠侧栏 + 顶栏 + 内容区（antd 内置 trigger 处理折叠） */
export function AdminLayout({ title, menu, headerRight, children }: AdminLayoutProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{ height: 32, margin: 16, color: '#fff', textAlign: 'center', lineHeight: '32px' }}>
          {title}
        </div>
        {menu}
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 16 }}>
          {headerRight}
        </Header>
        <Content style={{ margin: 16 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
