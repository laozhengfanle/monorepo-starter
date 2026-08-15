import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context.js';

/** 受保护路由：未登录重定向 /login（带来源，登录后跳回） */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
