import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Menu } from 'antd';
import { DashboardOutlined, TeamOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, Route, Routes } from 'react-router-dom';
import { AdminLayout, themeConfig } from '@starter/ui';
import { DashboardPage } from '../features/dashboard/pages/dashboard-page';
import { UsersPage } from '../features/users/pages/users-page';
import './app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/** 侧栏导航：与路由一一对应，当前路径高亮 */
function AppMenu(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      onClick={({ key }) => navigate(key)}
      items={[
        { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
        { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
      ]}
    />
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={themeConfig}>
        <AdminLayout title="monorepo-starter" menu={<AppMenu />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
          </Routes>
        </AdminLayout>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
