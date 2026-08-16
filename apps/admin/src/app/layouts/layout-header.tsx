import {
  FullscreenExitOutlined,
  FullscreenOutlined,
  LaptopOutlined,
  LogoutOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App, Avatar, Button, Dropdown, Input, Layout, Space, Typography, theme } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context.js';
import { useTheme } from '../providers/theme-provider.js';
import { useFullscreen } from '../hooks/use-fullscreen.js';
import { SettingsDrawer } from '../../features/settings/settings-drawer.js';
import { useSystemConfig } from '../providers/system-config-provider.js';
import heroPng from '../../assets/hero.png';

const { Header } = Layout;

const themeIconMap: Record<'system' | 'light' | 'dark', ReactNode> = {
  system: <LaptopOutlined />,
  light: <SunOutlined />,
  dark: <MoonOutlined />,
};

/** 顶栏：品牌 + 主题切换 + 全屏 + 偏好设置 + 用户下拉 */
export function LayoutHeader(): React.JSX.Element {
  const { token } = theme.useToken();
  const { notification } = App.useApp();
  const { mode, setMode } = useTheme();
  const { user, logout } = useAuth();
  const { settings } = useSystemConfig();
  const navigate = useNavigate();
  const { isFullscreen, toggle } = useFullscreen();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const themeMenuItems = [
    { key: 'system', icon: <LaptopOutlined />, label: '跟随系统' },
    { key: 'light', icon: <SunOutlined />, label: '亮色' },
    { key: 'dark', icon: <MoonOutlined />, label: '暗色' },
  ];

  const handleLogout = async (): Promise<void> => {
    await logout();
    notification.success({
      title: '已退出登录',
      description: '感谢使用，期待再次见面',
    });
    navigate('/login', { replace: true });
  };

  const userMenuItems = [
    {
      key: 'user-info',
      label: (
        <div>
          <div style={{ fontWeight: 500 }}>{user?.nickname || user?.username}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {user?.roleCodes.join(', ')}
          </Typography.Text>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    { key: 'profile', icon: <UserOutlined />, label: '个人中心' },
    { key: 'settings', icon: <SettingOutlined />, label: '账号设置' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  return (
    <Header
      className="flex items-center justify-between shrink-0 border-b"
      style={{
        padding: `0 ${token.paddingLG}px`,
        height: 56,
        lineHeight: '56px',
        background: token.colorBgContainer,
        borderColor: token.colorBorderSecondary,
      }}
    >
      <div className="flex items-center gap-2" style={{ lineHeight: 'normal' }}>
        <img src={settings.logo || heroPng} alt="logo" className="h-8" />
        <span style={{ fontSize: 16, fontWeight: 600 }}>{settings.name || 'monorepo-starter'}</span>
      </div>

      <Space size={4}>
        <Input.Search placeholder="搜索" allowClear style={{ width: 220 }} />
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

        <Button
          icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={() => void toggle()}
          aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
        />

        <Button
          icon={<SettingOutlined />}
          onClick={() => setSettingsOpen(true)}
          aria-label="偏好设置"
        />

        <Dropdown
          trigger={['hover']}
          arrow
          placement="bottomRight"
          menu={{
            items: userMenuItems,
            onClick: ({ key }) => {
              if (key === 'profile') {
                navigate('/account/profile');
              } else if (key === 'settings') {
                navigate('/account/settings');
              } else if (key === 'logout') {
                void handleLogout();
              }
            },
          }}
        >
          <Button style={{ padding: '0 8px' }}>
            <Space size={8}>
              <Avatar size={24} icon={<UserOutlined />} />
              <span style={{ lineHeight: 'normal' }}>{user?.nickname || user?.username}</span>
            </Space>
          </Button>
        </Dropdown>
      </Space>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Header>
  );
}
