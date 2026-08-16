import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  App,
  Avatar,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Space,
  Tag,
  Typography,
  theme,
  type FormInstance,
} from 'antd';
import {
  CameraOutlined,
  EditOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth/auth-context.js';
import { changePasswordApi, updateSelfApi, uploadAvatarApi } from './api.js';
import { ChangePasswordSchema, UpdateSelfSchema } from '@starter/api-client';
import { formatDateTime, ROLE_LABEL_MAP, ROLE_TAG_COLOR_MAP } from './shared.js';

const { Text, Title } = Typography;

const AVATAR_MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** 彩色图标 + 标题组合（对齐老项目 CardHeader） */
function CardHeader({
  color,
  icon,
  title,
}: {
  color: string;
  icon: ReactNode;
  title: string;
}): React.JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          borderRadius: 4,
          background: color,
          color: '#fff',
          fontSize: 14,
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
    </span>
  );
}

/** 把 zod 校验失败映射为 antd 表单字段错误（与 admin-accounts-page 的 applyZodErrors 同模式） */
function applyZodErrors(
  form: FormInstance,
  result: { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }
): void {
  form.setFields(
    result.error.issues.map((issue) => ({
      name: issue.path.map(String),
      errors: [issue.message],
    }))
  );
}

/** 账号设置（对标老项目 AccountSettingsPage）：头像/基本信息/账号状态/修改密码，全部接真实后端 */
export function AccountSettingsPage(): React.JSX.Element {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user, refreshMe } = useAuth();

  const displayRole = (user?.roleCodes ?? []).map((c) => ROLE_LABEL_MAP[c] ?? c).join(' / ') || '-';
  const roleTagColor = (user?.roleCodes ?? []).length > 0
    ? ROLE_TAG_COLOR_MAP[user!.roleCodes[0]] || 'blue'
    : 'default';

  // ===== 头像 =====
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState('');

  // ===== 基本信息 =====
  const [profileForm] = Form.useForm<{ nickname: string; email: string; phone: string }>();
  const [profileSaving, setProfileSaving] = useState(false);

  // ===== 修改密码 =====
  const [passwordForm] = Form.useForm<{ currentPassword: string; newPassword: string; confirm: string }>();
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        nickname: user.nickname,
        email: user.email,
        phone: user.phone,
      });
    }
    setAvatarPreview(user?.avatar ?? '');
  }, [user, profileForm]);

  /** 更换头像：上传 → 更新 profile → 刷新 me */
  const onAvatarClick = (): void => avatarInputRef.current?.click();
  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      void message.error('仅支持 JPG / PNG / WEBP 格式');
      return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
      void message.error('图片大小不能超过 2MB');
      return;
    }
    setAvatarLoading(true);
    try {
      const { url } = await uploadAvatarApi(file);
      await updateSelfApi({ avatar: url });
      await refreshMe();
      setAvatarPreview(url);
      void message.success('头像已更新');
    } catch {
      void message.error('头像上传失败，请重试');
    } finally {
      setAvatarLoading(false);
    }
  };

  /** 保存基本信息（提交前用 UpdateSelfSchema 做契约校验，失败映射到表单字段） */
  const onSaveProfile = async (): Promise<void> => {
    const values = profileForm.getFieldsValue();
    const parsed = UpdateSelfSchema.safeParse({
      nickname: values.nickname,
      email: values.email ?? '',
      phone: values.phone ?? '',
    });
    if (!parsed.success) {
      applyZodErrors(profileForm, parsed);
      return;
    }
    setProfileSaving(true);
    try {
      await updateSelfApi({
        nickname: parsed.data.nickname,
        email: parsed.data.email,
        phone: parsed.data.phone,
      });
      await refreshMe();
      void message.success('基本信息已保存');
    } catch (error) {
      const msg =
        typeof error === 'object' && error !== null && 'response' in error
          ? ((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message)
          : undefined;
      void message.error(msg ?? '保存失败，请重试');
    } finally {
      setProfileSaving(false);
    }
  };

  /** 修改密码（提交前用 ChangePasswordSchema 做契约校验，失败映射到表单字段） */
  const onChangePassword = async (): Promise<void> => {
    const values = passwordForm.getFieldsValue();
    const parsed = ChangePasswordSchema.safeParse({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (!parsed.success) {
      applyZodErrors(passwordForm, parsed);
      return;
    }
    setPasswordSaving(true);
    try {
      await changePasswordApi({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      void message.success('密码已修改，请重新登录');
      passwordForm.resetFields();
      // 后端已撤销全部 token，直接回登录页
      setTimeout(() => navigate('/login', { replace: true }), 600);
    } catch (error) {
      const msg =
        typeof error === 'object' && error !== null && 'response' in error
          ? ((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message)
          : undefined;
      void message.error(msg ?? '修改失败，请重试');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <Space orientation="vertical" size={token.marginMD} style={{ width: '100%' }}>
      <div>
        <Title level={5} style={{ margin: 0 }}>
          账号设置
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          修改头像、基本信息与密码
        </Text>
      </div>

      {/* 第一行：头像 + 基本信息（Grid 等高） */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: token.marginMD,
        }}
      >
        <Card
          title={<CardHeader color="#18A058" icon={<CameraOutlined />} title="头像" />}
          extra={
            <Button size="small" type="primary" variant="outlined" loading={avatarLoading} onClick={onAvatarClick}>
              更换头像
            </Button>
          }
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: '24px 0',
            }}
          >
            <Avatar
              src={avatarPreview || null}
              size={96}
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
            >
              {(user?.nickname || '?')[0]}
            </Avatar>
            <Text type="secondary" style={{ fontSize: 12 }}>
              支持 JPG / PNG / WEBP，大小不超过 2MB，上传后立即生效
            </Text>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => void onAvatarChange(e)}
            />
          </div>
        </Card>

        <Card title={<CardHeader color="#1677FF" icon={<EditOutlined />} title="基本信息" />}>
          <Form form={profileForm} layout="vertical" onFinish={onSaveProfile}>
            <Form.Item label="账号 ID">
              <Input value={user?.accountId ?? '-'} disabled />
            </Form.Item>
            <Form.Item
              name="nickname"
              label="昵称"
              rules={[
                { required: true, message: '请输入昵称' },
                { min: 2, max: 32, message: '昵称长度 2-32 个字符' },
              ]}
            >
              <Input placeholder="请输入昵称" allowClear />
            </Form.Item>
            <Form.Item
              name="email"
              label="邮箱"
              rules={[
                {
                  validator: (_rule, value) => {
                    if (!value) return Promise.resolve();
                    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
                      ? Promise.resolve()
                      : Promise.reject(new Error('邮箱格式不正确'));
                  },
                },
              ]}
            >
              <Input placeholder="请输入邮箱" allowClear />
            </Form.Item>
            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                {
                  validator: (_rule, value) => {
                    if (!value) return Promise.resolve();
                    return /^1[3-9]\d{9}$/.test(String(value))
                      ? Promise.resolve()
                      : Promise.reject(new Error('手机号格式不正确'));
                  },
                },
              ]}
            >
              <Input placeholder="请输入手机号" allowClear />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={profileSaving}>
                保存修改
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>

      {/* 第二行：账号状态 + 修改密码（Grid 等高） */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: token.marginMD,
        }}
      >
        <Card
          title={<CardHeader color="#FA8C16" icon={<SafetyCertificateOutlined />} title="账号状态" />}
        >
          <Descriptions bordered column={1} size="small" styles={{ label: { width: 120 } }}>
            <Descriptions.Item label="账号 ID">{user?.accountId ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="用户名">{user?.username ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="角色">
              <Tag color={roleTagColor}>{displayRole}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDateTime(user?.createdAt)}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={<CardHeader color="#F5222D" icon={<LockOutlined />} title="修改密码" />}>
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={onChangePassword}
            validateTrigger="onBlur"
          >
            <Form.Item
              name="currentPassword"
              label="当前密码"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 8, max: 100, message: '新密码至少 8 位' },
              ]}
            >
              <Input.Password placeholder="至少 8 位" autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirm"
              label="确认新密码"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator: (_rule, value) =>
                    !value || getFieldValue('newPassword') === value
                      ? Promise.resolve()
                      : Promise.reject(new Error('两次输入的密码不一致')),
                }),
              ]}
            >
              <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" danger htmlType="submit" loading={passwordSaving}>
                确认修改
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </Space>
  );
}
