import { useEffect, useMemo, useState } from 'react';
import { UploadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Spin,
  Typography,
  Upload,
} from 'antd';
import { useAdminConfigsQuery, useBatchUpdateConfigsMutation } from '../../../generated/graphql';
import { uploadFileApi } from '../../../shared/utils/upload.js';

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
  /** Logo 选择：antd Upload 拦截校验 → 走存储驱动上传（folder=logos）→ 存 url */
  const handleLogoSelect = (file: File): boolean => {
    if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
      void message.error('仅支持 PNG、JPG、WebP 格式的图片');
      return false;
    }
    if (file.size > LOGO_MAX_SIZE) {
      void message.error(`文件大小不能超过 ${LOGO_MAX_SIZE / 1024 / 1024}MB`);
      return false;
    }
    void (async () => {
      try {
        const result = await uploadFileApi(file, 'logos');
        setLogoPreview(result.url);
        form.setFieldValue('logo', result.url);
        void message.success('Logo 已上传，保存后生效');
      } catch (error) {
        void message.error(error instanceof Error ? error.message : 'Logo 上传失败，请重试');
      }
    })();
    return false; // 阻止 antd 自动上传（走上面的 uploadFileApi）
  };

  /** 移除 Logo */
  const handleLogoRemove = (): void => {
    setLogoPreview('');
    form.setFieldValue('logo', '');
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
    <Card title="后台设置">
      <Spin spinning={isLoading}>
      <Form<SettingsFormValues>
        form={form}
        layout="horizontal"
        labelCol={{ flex: '120px' }}
        labelWrap
      >
        {/* 系统基本信息 */}
        <Divider titlePlacement="left" plain>
          系统基本信息
        </Divider>
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item
              label="系统名称"
              name="systemName"
              rules={[{ required: true, message: '请输入系统名称' }]}
              extra="后台显示的系统名称"
            >
              <Input placeholder="请输入系统名称" maxLength={50} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="页脚文本" name="footerText" extra="显示在页面底部的版权信息">
              <Input placeholder="© 2026 zhengbo" maxLength={100} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="系统 Logo"
              name="logo"
              extra="支持 PNG、JPG、WebP 格式，建议尺寸 48x48"
            >
              <Upload
                accept="image/png,image/jpeg,image/webp"
                showUploadList={false}
                beforeUpload={handleLogoSelect}
                fileList={[]}
              >
                {logoPreview ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                      src={logoPreview}
                      alt="logo"
                      style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain', border: '1px solid rgba(0,0,0,0.1)' }}
                    />
                    <Button size="small">更换 Logo</Button>
                    <Button size="small" danger onClick={(e) => { e.stopPropagation(); handleLogoRemove(); }}>
                      移除
                    </Button>
                  </div>
                ) : (
                  <Button icon={<UploadOutlined />}>上传 Logo</Button>
                )}
              </Upload>
            </Form.Item>
          </Col>
        </Row>

        {/* 安全策略 */}
        <Divider titlePlacement="left" plain>
          安全策略
        </Divider>
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item
              label="密码最小长度"
              name="passwordMinLength"
              extra="6-32 位"
            >
              <InputNumber min={6} max={32} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="登录失败阈值"
              name="loginFailThreshold"
              extra="超过后锁定账号（次）"
            >
              <InputNumber min={3} max={20} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="锁定时长" name="lockDuration" extra="分钟">
              <InputNumber min={5} max={120} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="密码复杂度"
              name="passwordComplexity"
              rules={[{ required: true, message: '请选择密码复杂度' }]}
              extra={complexityDescMap[passwordComplexity ?? 'medium']}
            >
              <Select options={complexityOptions} placeholder="请选择" />
            </Form.Item>
          </Col>
        </Row>

        {/* 界面配置 */}
        <Divider titlePlacement="left" plain>
          界面配置
        </Divider>
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item label="Keep-alive 上限" name="keepAliveMax" extra="0 表示不缓存（个页面）">
              <InputNumber min={0} max={50} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="请求超时" name="requestTimeout" extra="毫秒">
              <InputNumber min={100} max={60000} step={1000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        {/* 水印设置 */}
        <Divider titlePlacement="left" plain>
          水印设置
        </Divider>
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item
              label="水印内容"
              name="watermarkContent"
              extra="支持变量：{{username}}（当前用户名）、{{date}}（当前日期）；留空则不显示"
            >
              <Input placeholder="请输入水印文本" maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
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
          </Col>
        </Row>

        <Form.Item label=" " colon={false} style={{ marginBottom: 0 }}>
          <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
            保存设置
          </Button>
        </Form.Item>
      </Form>
      </Spin>
    </Card>
  );
}
