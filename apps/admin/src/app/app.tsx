import { QueryClientProvider } from '@tanstack/react-query';
import { ApolloProvider } from '@apollo/client';
import { useEffect } from 'react';
import { useNavigate, Route, Routes } from 'react-router-dom';
import { Typography } from 'antd';
import { LoginPage } from '../features/auth/pages/login-page';
import { AuthProvider } from './auth/auth-context.js';
import { ProtectedRoute } from './auth/protected-route.js';
import { MainLayout } from './layouts/main-layout.js';
import { AppProviders } from './providers/index.js';
import { SystemConfigProvider } from './providers/system-config-provider.js';
import { APP_ROUTES, RouteGuard } from './route-registry.js';
import { apolloClient } from './apollo-client';
import { queryClient } from './query-client.js';

/** /redirect：标签页"重新加载"的中转路由（卸载再挂载当前页触发重新请求） */
function RedirectPage(): React.JSX.Element | null {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);
  return null;
}

export function App() {
  return (
    <AppProviders>
      <AuthProvider>
        <ApolloProvider client={apolloClient}>
          <SystemConfigProvider>
            <QueryClientProvider client={queryClient}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/redirect" element={<RedirectPage />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <MainLayout>
                        <Routes>
                          {APP_ROUTES.map((route) => (
                            <Route
                              key={route.path}
                              path={route.path}
                              element={
                                <RouteGuard permission={route.permission}>
                                  {route.element}
                                </RouteGuard>
                              }
                            />
                          ))}
                          <Route
                            path="*"
                            element={
                              <Typography.Text type="secondary">
                                页面不存在或无权访问
                              </Typography.Text>
                            }
                          />
                        </Routes>
                      </MainLayout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </QueryClientProvider>
          </SystemConfigProvider>
        </ApolloProvider>
      </AuthProvider>
    </AppProviders>
  );
}

export default App;
