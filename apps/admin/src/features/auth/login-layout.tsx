import { Button, Layout, Space, theme as antdTheme } from 'antd';
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useSystemConfig } from '../../app/providers/system-config-provider.js';
import { APP_VERSION } from '../../app/version.js';
import { useFullscreen } from '../../app/hooks/use-fullscreen.js';
import { ThemeToggle } from '../../shared/components/theme-toggle.js';
import heroPng from '../../assets/hero.png';

const { Header, Footer, Content } = Layout;

/**
 * 登录页布局（对标 antd-admin LoginLayout）：
 * 透明 Header（品牌 + 主题切换）+ 内容区 + Footer，背景走 token。
 */
export function LoginLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const { token } = antdTheme.useToken();
  const { settings } = useSystemConfig();
  const { isFullscreen, toggle } = useFullscreen();

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
          <img src={settings.logo || heroPng} alt="logo" className="h-8" />
          <span className="text-lg font-semibold">
            {settings.name || 'monorepo-starter'}
          </span>
        </div>

        <Space>
          <ThemeToggle />
          <Button
            icon={
              isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />
            }
            onClick={() => void toggle()}
            aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
          />
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
          fontSize: 13,
          padding: `${token.paddingSM}px ${token.paddingLG}px`,
        }}
      >
        <Space
          separator={<span style={{ color: token.colorTextTertiary }}>·</span>}
          wrap
          size={4}
        >
          <span>{settings.name || 'monorepo-starter'}</span>
          <span>v{APP_VERSION}</span>
          {settings.footerText && <span>{settings.footerText}</span>}
          {!(settings.footerText ?? '').includes('©') && (
            <span>© {new Date().getFullYear()} zhengbo</span>
          )}
        </Space>
      </Footer>
    </Layout>
  );
}
