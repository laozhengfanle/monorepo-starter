import { QueryClientProvider } from '@tanstack/react-query';
import { ApolloProvider } from '@apollo/client';
import { Suspense, useEffect } from 'react';
import { useNavigate, Route, Routes } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { LoginPage } from '../features/auth/pages/login-page';
import { AuthProvider } from './auth/auth-context.js';
import { ProtectedRoute } from './auth/protected-route.js';
import { MainLayout } from './layouts/main-layout.js';
import { AppProviders } from './providers/index.js';
import { SystemConfigProvider } from './providers/system-config-provider.js';
import { APP_ROUTES, RouteGuard } from './route-registry.js';
import { apolloClient } from './apollo-client';
import { queryClient } from './query-client.js';

/** /redirect：标签页"重新加载"的中转路由（卸载再挂载当前页触发重新请求，tab-bar-provider 使用） */
function RedirectPage(): React.JSX.Element | null {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);
  return null;
}

/** 404：受保护区内未知路径（无权限场景由 RouteGuard 渲染 403） */
function NotFoundPage(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="404"
      subTitle="页面不存在或无权访问"
      extra={
        <Button type="primary" onClick={() => navigate('/', { replace: true })}>
          返回首页
        </Button>
      }
    />
  );
}

/** 懒加载页面 fallback（Suspense 挂起时居中转圈） */
function PageFallback(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
      <Spin size="large" />
    </div>
  );
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
                        <Suspense fallback={<PageFallback />}>
                          <Routes>
                            {APP_ROUTES.map((route) => {
                              const PageComponent = route.component;
                              return (
                                <Route
                                  key={route.path}
                                  path={route.path}
                                  element={
                                    <RouteGuard permission={route.permission}>
                                      <PageComponent />
                                    </RouteGuard>
                                  }
                                />
                              );
                            })}
                            <Route path="*" element={<NotFoundPage />} />
                          </Routes>
                        </Suspense>
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
