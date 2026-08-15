import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApolloProvider } from '@apollo/client';
import { Button, ConfigProvider, Menu, Space, Typography } from 'antd';
import { DashboardOutlined, LogoutOutlined, SafetyOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, Route, Routes } from 'react-router-dom';
import { AdminLayout, themeConfig } from '@starter/ui';
import { DashboardPage } from '../features/dashboard/pages/dashboard-page';
import { UsersPage } from '../features/users/pages/users-page';
import { AdminAccountsPage } from '../features/admin-accounts/pages/admin-accounts-page';
import { AdminRolesPage } from '../features/admin-roles/pages/admin-roles-page';
import { LoginPage } from '../features/auth/pages/login-page';
import { AuthProvider, useAuth } from './auth/auth-context.js';
import { usePermission } from './auth/use-permission.js';
import { ProtectedRoute } from './auth/protected-route.js';
import { apolloClient } from './apollo-client';
import './app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/** 侧栏导航：按权限动态显隐，与路由一一对应 */
function AppMenu(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const canViewUsers = usePermission('user:list');
  const canViewAccounts = usePermission('account:list');
  const canViewRoles = usePermission('role:list');

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      onClick={({ key }) => navigate(key)}
      items={[
        { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
        ...(canViewUsers
          ? [{ key: '/users', icon: <TeamOutlined />, label: '用户管理' }]
          : []),
        ...(canViewAccounts
          ? [{ key: '/admin/accounts', icon: <UserOutlined />, label: '账户管理' }]
          : []),
        ...(canViewRoles
          ? [{ key: '/admin/roles', icon: <SafetyOutlined />, label: '角色权限' }]
          : []),
      ]}
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
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/users" element={<UsersPage />} />
                        <Route path="/admin/accounts" element={<AdminAccountsPage />} />
                        <Route path="/admin/roles" element={<AdminRolesPage />} />
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
