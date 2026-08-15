import { Button, Dropdown, Layout, Space, theme as antdTheme } from 'antd';
import { ExpandOutlined, LaptopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useTheme } from '../../app/providers/theme-provider.js';
import heroPng from '../../assets/hero.png';

const { Header, Footer, Content } = Layout;

const themeIconMap: Record<'system' | 'light' | 'dark', ReactNode> = {
  system: <LaptopOutlined />,
  light: <SunOutlined />,
  dark: <MoonOutlined />,
};

/**
 * 登录页布局（对标 antd-admin LoginLayout）：
 * 透明 Header（品牌 + 主题切换）+ 内容区 + Footer，背景走 token。
 */
export function LoginLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const { token } = antdTheme.useToken();
  const { mode, setMode } = useTheme();

  const themeMenuItems = [
    { key: 'system', icon: <LaptopOutlined />, label: '跟随系统' },
    { key: 'light', icon: <SunOutlined />, label: '亮色' },
    { key: 'dark', icon: <MoonOutlined />, label: '暗色' },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Header
        className="flex items-center justify-between shrink-0"
        style={{
          padding: `0 ${token.paddingLG}px`,
          background: 'transparent',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div className="flex items-center gap-2">
          <img src={heroPng} alt="logo" className="h-8" />
          <span className="text-lg font-semibold">monorepo-starter</span>
        </div>

        <Space>
          <Dropdown
            trigger={['hover']}
            arrow
            placement="bottomRight"
            menu={{
              items: themeMenuItems,
              onClick: ({ key }) => setMode(key as 'system' | 'light' | 'dark'),
            }}
          >
            <Button icon={themeIconMap[mode]} aria-label="主题切换" />
          </Dropdown>
          <Button icon={<ExpandOutlined />} aria-label="全屏" />
        </Space>
      </Header>

      <Content
        className="flex-1 overflow-auto"
        style={{ background: token.colorBgLayout, display: 'flex' }}
      >
        {children}
      </Content>

      <Footer
        className="shrink-0 text-center"
        style={{
          background: 'transparent',
          color: token.colorTextSecondary,
          padding: `${token.paddingSM}px ${token.paddingLG}px`,
        }}
      >
        monorepo-starter ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
}
