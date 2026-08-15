import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApolloProvider } from '@apollo/client';
import { Button, ConfigProvider, Menu, Space, Typography } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import {
  AppstoreOutlined,
  DashboardOutlined,
  FileOutlined,
  LogoutOutlined,
  MenuOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, Route, Routes } from 'react-router-dom';
import { AdminLayout, themeConfig } from '@starter/ui';
import type { AdminMenuNode } from '@starter/api-client';
import { LoginPage } from '../features/auth/pages/login-page';
import { AuthProvider, useAuth } from './auth/auth-context.js';
import { ProtectedRoute } from './auth/protected-route.js';
import { APP_ROUTES, RouteGuard } from './route-registry.js';
import { apolloClient } from './apollo-client';
import './app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/** 后端菜单图标名 → antd 图标组件（与菜单管理页 ICON_OPTIONS 保持一致） */
const ICON_MAP: Record<string, ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  TeamOutlined: <TeamOutlined />,
  UserOutlined: <UserOutlined />,
  SafetyOutlined: <SafetyOutlined />,
  MenuOutlined: <MenuOutlined />,
  SettingOutlined: <SettingOutlined />,
  FileOutlined: <FileOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
};

/** 菜单树节点 → antd Menu item（按钮不进侧栏；目录渲染为子菜单） */
function toMenuItem(node: AdminMenuNode): ItemType {
  const children = node.children.filter((c) => c.type !== 'button');
  const icon = node.icon ? ICON_MAP[node.icon] : undefined;
  if (children.length > 0) {
    return {
      key: node.path ?? node.code,
      icon,
      label: node.name,
      children: children.map(toMenuItem),
    };
  }
  return { key: node.path ?? node.code, icon, label: node.name };
}

/** 侧栏导航：菜单来自后端 me.menus（已按权限裁剪），不再硬编码 */
function AppMenu(): React.JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items: ItemType[] = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    ...(user?.menus ?? []).map(toMenuItem),
  ];

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      onClick={({ key }) => navigate(key)}
      items={items}
    />
  );
}

/** 顶栏右侧：当前用户 + 登出 */
function HeaderActions(): React.JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Space size="middle">
      <Typography.Text>{user?.nickname || user?.username}</Typography.Text>
      <Button size="small" icon={<LogoutOutlined />} onClick={() => void handleLogout()}>
        退出
      </Button>
    </Space>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ApolloProvider client={apolloClient}>
        <QueryClientProvider client={queryClient}>
          <ConfigProvider theme={themeConfig}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AdminLayout title="monorepo-starter" menu={<AppMenu />} headerRight={<HeaderActions />}>
                      <Routes>
                        {APP_ROUTES.map((route) => (
                          <Route
                            key={route.path}
                            path={route.path}
                            element={
                              <RouteGuard permission={route.permission}>{route.element}</RouteGuard>
                            }
                          />
                        ))}
                        <Route
                          path="*"
                          element={
                            <Typography.Text type="secondary">页面不存在或无权访问</Typography.Text>
                          }
                        />
                      </Routes>
                    </AdminLayout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </ConfigProvider>
        </QueryClientProvider>
      </ApolloProvider>
    </AuthProvider>
  );
}

export default App;
