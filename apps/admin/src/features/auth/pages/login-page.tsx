import { useState } from 'react';
import { Button, Card, Form, Input, message, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoginSchema } from '@starter/api-client';
import { useAuth } from '../../../app/auth/auth-context.js';

/** 登录页：认证通过后跳回来源页 */
export function LoginPage(): React.JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const handleSubmit = async (values: { username: string; password: string }): Promise<void> => {
    const parsed = LoginSchema.safeParse(values);
    if (!parsed.success) {
      void message.error(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setLoading(true);
    try {
      await login(parsed.data.username, parsed.data.password);
      navigate(from, { replace: true });
    } catch {
      void message.error('用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f5f5f5',
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0 }}>
          monorepo-starter
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
          管理端登录
        </Typography.Text>
        <Form onFinish={handleSubmit} layout="vertical">
          <Form.Item name="username" label="用户名">
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码">
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
