import { useState } from 'react';
import { Button, Card, Form, Input, Layout, Space, Typography, message, theme } from 'antd';
import { LaptopOutlined, LockOutlined, MoonOutlined, SunOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoginSchema } from '@starter/api-client';
import { useAuth } from '../../../app/auth/auth-context.js';
import { useTheme } from '../../../app/providers/theme-provider.js';

const { Header, Content, Footer } = Layout;

/** 登录页：品牌 + 主题切换 + 居中登录卡片（对标旧版 LoginLayout） */
export function LoginPage(): React.JSX.Element {
  const { login } = useAuth();
  const { mode, setMode } = useTheme();
  const { token } = theme.useToken();
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

  const themeMenuItems = [
    { key: 'system', icon: <LaptopOutlined />, label: '跟随系统' },
    { key: 'light', icon: <SunOutlined />, label: '亮色' },
    { key: 'dark', icon: <MoonOutlined />, label: '暗色' },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Header
        className="flex items-center justify-between"
        style={{
          padding: `0 ${token.paddingLG}px`,
          height: 56,
          lineHeight: '56px',
          background: 'transparent',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div className="flex items-center gap-2" style={{ lineHeight: 'normal' }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: token.borderRadius,
              background: token.colorPrimary,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            MS
          </span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>monorepo-starter</span>
        </div>

        <Space>
          {themeMenuItems.map((item) => (
            <Button
              key={item.key}
              type="text"
              size="small"
              icon={item.icon}
              onClick={() => setMode(item.key as 'system' | 'light' | 'dark')}
              style={
                mode === item.key
                  ? { color: token.colorPrimary, background: token.colorPrimaryBg }
                  : undefined
              }
            >
              {item.label}
            </Button>
          ))}
        </Space>
      </Header>

      <Content className="flex items-center justify-center" style={{ padding: 24 }}>
        <Card style={{ width: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span
              style={{
                display: 'inline-flex',
                width: 48,
                height: 48,
                borderRadius: token.borderRadiusLG,
                background: token.colorPrimary,
                color: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 24,
                marginBottom: 12,
              }}
            >
              MS
            </span>
            <Typography.Title level={4} style={{ margin: 0 }}>
              monorepo-starter
            </Typography.Title>
            <Typography.Text type="secondary">管理端登录</Typography.Text>
          </div>
          <Form onFinish={handleSubmit} layout="vertical">
            <Form.Item name="username" label="用户名">
              <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" size="large" />
            </Form.Item>
            <Form.Item name="password" label="密码">
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                autoComplete="current-password"
                size="large"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} size="large">
              登录
            </Button>
          </Form>
        </Card>
      </Content>

      <Footer style={{ textAlign: 'center', background: 'transparent', color: token.colorTextSecondary }}>
        monorepo-starter ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
}
