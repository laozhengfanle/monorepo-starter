import { useState } from 'react';
import { App, Button, Card, Form, Input, theme as antdTheme } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoginSchema } from '@starter/api-client';
import { useAuth } from '../../../app/auth/auth-context.js';
import { LoginLayout } from '../login-layout.js';
import heroPng from '../../../assets/hero.png';

/** 开发测试账号（点击快速填充） */
const TEST_ACCOUNTS = [
  { label: '超级管理员', username: 'root', password: 'Root!123' },
];

/**
 * 登录页（对标 antd-admin LoginPage）：
 * 圆点底纹 + 多档动画几何元素背景装饰 + 居中登录卡片 + 测试账号快速填充。
 */
export function LoginPage(): React.JSX.Element {
  const { login } = useAuth();
  const { token } = antdTheme.useToken();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

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
      void message.success('登录成功');
      navigate(from, { replace: true });
    } catch {
      void message.error('用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  const fillTestAccount = (username: string, password: string): void => {
    form.setFieldsValue({ username, password });
  };

  return (
    <LoginLayout>
      <div
        className="login-content relative flex items-center justify-center"
        style={{ minHeight: '100%', background: token.colorBgLayout }}
      >
        {/* 背景装饰：圆点底纹 + 多档尺寸几何元素 + 多种动画 */}
        <style>{`
          .login-content::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image: radial-gradient(circle, ${token.colorPrimary}10 1px, transparent 1.5px);
            background-size: 28px 28px;
            pointer-events: none;
            z-index: 0;
          }
          .bg-deco { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
          .bg-deco .d { position: absolute; display: block; }

          .d-1 { top: 8%;  left: 18%; width: 5px;  height: 5px;  background: ${token.colorPrimary}; border-radius: 50%; }
          .d-2 { top: 22%; left: 6%;  width: 4px;  height: 4px;  background: ${token.colorSuccess}; border-radius: 50%; }
          .d-3 { top: 38%; left: 14%; width: 6px;  height: 6px;  background: ${token.colorPrimary}; border-radius: 50%; }
          .d-4 { top: 16%; right: 8%; width: 5px;  height: 5px;  background: ${token.colorWarning}; border-radius: 50%; }
          .d-5 { top: 42%; right: 18%; width: 4px; height: 4px; background: ${token.colorPrimary}; border-radius: 50%; }
          .d-6 { bottom: 12%; left: 6%; width: 5px;  height: 5px;  background: ${token.colorPrimary}; border-radius: 50%; }
          .d-7 { bottom: 28%; right: 4%; width: 6px; height: 6px; background: ${token.colorSuccess}; border-radius: 50%; }
          .d-8 { bottom: 8%;  right: 22%; width: 4px; height: 4px; background: ${token.colorWarning}; border-radius: 50%; }

          .d-9  { top: 6%;  left: 30%; width: 24px; height: 24px; border: 1.5px solid ${token.colorPrimary}99; border-radius: 50%; }
          .d-10 { top: 18%; right: 30%; width: 0; height: 0; border-left: 12px solid transparent; border-right: 12px solid transparent; border-bottom: 22px solid ${token.colorWarning}99; opacity: 0.7; }
          .d-11 { bottom: 22%; left: 18%; width: 22px; height: 22px; border: 1.5px solid ${token.colorPrimary}99; transform: rotate(45deg); }
          .d-12 { bottom: 18%; right: 28%; width: 30px; height: 30px; border: 1.5px solid ${token.colorSuccess}99; border-radius: 50%; }

          .d-13 { top: -40px;  left: -30px;  width: 140px; height: 140px; border: 1px solid ${token.colorPrimary}4d; border-radius: 50%; }
          .d-14 { bottom: -50px; right: -40px; width: 160px; height: 160px; border: 1px solid ${token.colorPrimary}4d; border-radius: 50%; }
          .d-15 { top: 35%; right: -50px;  width: 110px; height: 110px; border: 1px solid ${token.colorSuccess}40; border-radius: 50%; }

          .d-16 { top: 70%; left: 4%;  width: 28px; height: 1.5px; background: ${token.colorPrimary}99; }
          .d-17 { top: 30%; left: 50%; width: 10px; height: 10px; transform: translateX(-50%); }
          .d-17::before, .d-17::after { content: ''; position: absolute; background: ${token.colorPrimary}; }
          .d-17::before { left: 50%; top: 0; bottom: 0; width: 1.5px; margin-left: -0.75px; }
          .d-17::after  { top: 50%; left: 0; right: 0; height: 1.5px; margin-top: -0.75px; }

          @keyframes twinkle {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50%      { opacity: 1;   transform: scale(1.4); }
          }
          .d-1  { animation: twinkle 2.6s ease-in-out infinite;            }
          .d-2  { animation: twinkle 3.2s ease-in-out infinite -0.4s;     }
          .d-3  { animation: twinkle 2.2s ease-in-out infinite -0.8s;     }
          .d-4  { animation: twinkle 3.6s ease-in-out infinite -1.2s;     }
          .d-5  { animation: twinkle 2.8s ease-in-out infinite -1.6s;     }
          .d-6  { animation: twinkle 3.0s ease-in-out infinite -2.0s;     }
          .d-7  { animation: twinkle 2.4s ease-in-out infinite -0.2s;     }
          .d-8  { animation: twinkle 3.4s ease-in-out infinite -1.0s;     }

          @keyframes drift-a {
            0%, 100% { transform: translate(0, 0)        rotate(0deg); }
            50%      { transform: translate(8px, -12px) rotate(180deg); }
          }
          @keyframes drift-b {
            0%, 100% { transform: translate(0, 0)        rotate(0deg); }
            50%      { transform: translate(-10px, 10px) rotate(-180deg); }
          }
          .d-9  { animation: drift-a 18s ease-in-out infinite; }
          .d-10 { animation: drift-b 22s ease-in-out infinite; }
          .d-11 { animation: drift-a 20s ease-in-out infinite; }
          .d-12 { animation: drift-b 24s ease-in-out infinite; }

          @keyframes slow-spin-cw  { from { transform: rotate(0deg);   } to { transform: rotate(360deg);  } }
          @keyframes slow-spin-ccw { from { transform: rotate(0deg);   } to { transform: rotate(-360deg); } }
          .d-13 { animation: slow-spin-cw  80s linear infinite; }
          .d-14 { animation: slow-spin-ccw 90s linear infinite; }
          .d-15 { animation: slow-spin-cw  70s linear infinite; }

          @keyframes line-stretch {
            0%, 100% { transform: scaleX(1);    opacity: 0.5; }
            50%      { transform: scaleX(1.6);  opacity: 1; }
          }
          .d-16 { transform-origin: left center; animation: line-stretch 3.2s ease-in-out infinite; }

          @keyframes plus-breathe {
            0%, 100% { transform: translateX(-50%) scale(1);   opacity: 0.6; }
            50%      { transform: translateX(-50%) scale(1.5); opacity: 1; }
          }
          .d-17 { animation: plus-breathe 3.6s ease-in-out infinite; }

          @keyframes card-in {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .login-card { animation: card-in 0.5s cubic-bezier(0.2, 0.7, 0.2, 1); }
        `}</style>

        {/* 散落的小元素（4 个尺寸档 × 多种动画） */}
        <div className="bg-deco" aria-hidden>
          <span className="d d-1" /><span className="d d-2" />
          <span className="d d-3" /><span className="d d-4" />
          <span className="d d-5" /><span className="d d-6" />
          <span className="d d-7" /><span className="d d-8" />
          <span className="d d-9"  /><span className="d d-10" />
          <span className="d d-11" /><span className="d d-12" />
          <span className="d d-13" /><span className="d d-14" />
          <span className="d d-15" />
          <span className="d d-16" /><span className="d d-17" />
        </div>

        {/* 居中登录卡片 */}
        <div className="login-card relative z-1 py-12">
          <Card
            style={{
              width: 400,
              borderRadius: token.borderRadiusLG,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            }}
            styles={{ body: { padding: 40 } }}
          >
            <div className="text-center" style={{ marginBottom: 32 }}>
              <img src={heroPng} alt="logo" style={{ height: 56, margin: '0 auto 16px' }} />
              <h1 className="m-0" style={{ fontSize: 22, fontWeight: 600, color: token.colorTextHeading }}>
                monorepo-starter
              </h1>
              <p className="m-0" style={{ marginTop: 8, fontSize: 14, color: token.colorTextSecondary }}>
                企业级后台管理系统
              </p>
            </div>

            <Form
              form={form}
              onFinish={handleSubmit}
              size="large"
              initialValues={{ username: 'root', password: 'Root!123' }}
            >
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input allowClear prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password
                  allowClear
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  autoComplete="current-password"
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 12 }}>
                <Button type="primary" htmlType="submit" block loading={loading}>
                  登 录
                </Button>
              </Form.Item>
            </Form>

            {/* 测试账号提示 */}
            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: token.colorTextSecondary,
                  marginBottom: 8,
                  fontWeight: 500,
                }}
              >
                开发测试账号（点击快速填充）
              </div>
              {TEST_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => fillTestAccount(acc.username, acc.password)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                    fontSize: 12,
                    color: token.colorText,
                    padding: '4px 0',
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  <span>{acc.label}</span>
                  <span>{acc.username} / {acc.password}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </LoginLayout>
  );
}
