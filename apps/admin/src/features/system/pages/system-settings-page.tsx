import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Divider, Form, Input, InputNumber, Select, Typography } from 'antd';
import { useAdminConfigsQuery, useBatchUpdateConfigsMutation } from '../../../generated/graphql';

const { Text } = Typography;

/** 配置 key：settings（后台设置/系统全局参数） */
const SETTINGS_KEY = 'settings';

/** 密码复杂度选项 */
const complexityOptions = [
  { label: '低：仅长度要求', value: 'low' },
  { label: '中：包含字母和数字', value: 'medium' },
  { label: '高：包含大小写字母、数字和特殊字符', value: 'high' },
];

const complexityDescMap: Record<string, string> = {
  low: '密码只需达到最小长度',
  medium: '密码必须同时包含字母和数字',
  high: '密码必须包含大小写字母、数字和特殊字符',
};

/** Logo 上传白名单（排除 SVG 防 XSS） */
const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_SIZE = 2 * 1024 * 1024;

/** 表单数据（提交时映射到 settings.value 的字段名） */
interface SettingsFormValues {
  systemName: string;
  footerText: string;
  logo: string;
  passwordMinLength: number;
  loginFailThreshold: number;
  lockDuration: number;
  passwordComplexity: 'low' | 'medium' | 'high';
  watermarkContent: string;
  keepAliveMax: number;
  requestTimeout: number;
}

/**
 * 系统设置 → 后台设置（对标老项目 配置中心/系统设置）：
 * 系统基本信息 + 安全策略 + 界面配置 + 水印设置，保存到 system_config key=settings
 */
export function SystemSettingsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<SettingsFormValues>();
  const [logoPreview, setLogoPreview] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const { data } = useAdminConfigsQuery();
  const [batchUpdate, { loading: saving }] = useBatchUpdateConfigsMutation();

  const passwordComplexity = Form.useWatch('passwordComplexity', form);
  const watermarkContent = Form.useWatch('watermarkContent', form);

  // 水印预览（变量替换为示例值）
  const watermarkPreview = useMemo(() => {
    if (!watermarkContent?.trim()) return '';
    return watermarkContent
      .replace(/\{\{username\}\}/g, '张三')
      .replace(/\{\{date\}\}/g, '2026-08-15');
  }, [watermarkContent]);

  // 加载 settings 配置回填表单
  useEffect(() => {
    if (!data) return;
    const settings = data.adminConfigs.find((c) => c.key === SETTINGS_KEY);
    if (settings) {
      const v = settings.value as Record<string, unknown>;
      form.setFieldsValue({
        systemName: (v.name as string) ?? '',
        footerText: (v.footerText as string) ?? '',
        logo: (v.logo as string) ?? '',
        passwordMinLength: (v.passwordMinLength as number) ?? 8,
        loginFailThreshold: (v.loginFailThreshold as number) ?? 5,
        lockDuration: (v.lockDuration as number) ?? 30,
        passwordComplexity: (v.passwordComplexity as 'low' | 'medium' | 'high') ?? 'medium',
        watermarkContent: (v.watermarkContent as string) ?? '{{username}} {{date}}',
        keepAliveMax: (v.keepAliveMax as number) ?? 10,
        requestTimeout: (v.requestTimeout as number) ?? 10000,
      });
      setLogoPreview((v.logo as string) || '');
    }
    setIsLoading(false);
  }, [data, form]);

  /** Logo 选择：客户端 FileReader → base64（白名单 + 大小限制） */
  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
      void message.error('仅支持 PNG、JPG、WebP 格式的图片');
      return;
    }
    if (file.size > LOGO_MAX_SIZE) {
      void message.error(`文件大小不能超过 ${LOGO_MAX_SIZE / 1024 / 1024}MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoPreview(result);
      form.setFieldValue('logo', result);
    };
    reader.readAsDataURL(file);
    void message.success('Logo 已选择，保存后生效');
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const values = form.getFieldsValue();
    try {
      await batchUpdate({
        variables: {
          input: {
            updates: [
              {
                key: SETTINGS_KEY,
                value: {
                  name: values.systemName,
                  logo: values.logo,
                  footerText: values.footerText,
                  passwordMinLength: values.passwordMinLength,
                  loginFailThreshold: values.loginFailThreshold,
                  lockDuration: values.lockDuration,
                  passwordComplexity: values.passwordComplexity,
                  watermarkContent: values.watermarkContent,
                  keepAliveMax: values.keepAliveMax,
                  requestTimeout: values.requestTimeout,
                },
              },
            ],
          },
        },
      });
      document.title = values.systemName;
      void message.success('设置已保存');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '保存失败，请重试';
      void message.error(msg);
    }
  };

  return (
    <Card title="后台设置" loading={isLoading}>
      <Form<SettingsFormValues> form={form} layout="vertical" style={{ maxWidth: 720 }}>
        {/* 系统基本信息 */}
        <Divider titlePlacement="left" plain>
          系统基本信息
        </Divider>
        <Form.Item
          label="系统名称"
          name="systemName"
          rules={[{ required: true, message: '请输入系统名称' }]}
          extra="后台显示的系统名称"
        >
          <Input placeholder="请输入系统名称" maxLength={50} />
        </Form.Item>
        <Form.Item label="页脚文本" name="footerText" extra="显示在页面底部的版权信息">
          <Input placeholder="© 2026 zhengbo" maxLength={100} />
        </Form.Item>
        <Form.Item label="系统 Logo" name="logo" extra="支持 PNG、JPG、WebP 格式，建议尺寸 48x48">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="logo"
                style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  color: 'rgba(0,0,0,0.45)',
                }}
              >
                Logo
              </div>
            )}
            <Button size="small" onClick={() => document.getElementById('settings-logo-input')?.click()}>
              更换 Logo
            </Button>
            <input
              id="settings-logo-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={onLogoChange}
            />
          </div>
        </Form.Item>

        {/* 安全策略 */}
        <Divider titlePlacement="left" plain>
          安全策略
        </Divider>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 24px' }}>
          <Form.Item
            label="密码最小长度"
            name="passwordMinLength"
            extra="6-32 位"
          >
            <InputNumber min={6} max={32} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="登录失败阈值"
            name="loginFailThreshold"
            extra="超过后锁定账号（次）"
          >
            <InputNumber min={3} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="锁定时长" name="lockDuration" extra="分钟">
            <InputNumber min={5} max={120} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="密码复杂度"
            name="passwordComplexity"
            rules={[{ required: true, message: '请选择密码复杂度' }]}
            extra={complexityDescMap[passwordComplexity ?? 'medium']}
          >
            <Select options={complexityOptions} placeholder="请选择" />
          </Form.Item>
        </div>

        {/* 界面配置 */}
        <Divider titlePlacement="left" plain>
          界面配置
        </Divider>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 24px' }}>
          <Form.Item label="Keep-alive 上限" name="keepAliveMax" extra="0 表示不缓存（个页面）">
            <InputNumber min={0} max={50} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="请求超时" name="requestTimeout" extra="毫秒">
            <InputNumber min={100} max={60000} step={1000} style={{ width: '100%' }} />
          </Form.Item>
        </div>

        {/* 水印设置 */}
        <Divider titlePlacement="left" plain>
          水印设置
        </Divider>
        <Form.Item
          label="水印内容"
          name="watermarkContent"
          extra="支持变量：{{username}}（当前用户名）、{{date}}（当前日期）；留空则不显示"
        >
          <Input placeholder="请输入水印文本" maxLength={100} />
        </Form.Item>
        <Form.Item label="预览">
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 96,
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.12)',
              background: 'rgba(0,0,0,0.02)',
            }}
          >
            {watermarkPreview ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: 'rotate(-20deg)',
                  color: 'rgba(0,0,0,0.08)',
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {watermarkPreview}
              </div>
            ) : (
              <Text
                type="secondary"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                }}
              >
                无水印
              </Text>
            )}
          </div>
        </Form.Item>

        <Form.Item>
          <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
            保存设置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
