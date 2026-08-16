import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Spin, Switch, Typography } from 'antd';
import {
  useTurnstileConfigQuery,
  useUpdateTurnstileConfigMutation,
} from '../../../generated/graphql';
import { usePermission } from '../../../app/auth/use-permission.js';

const { Text } = Typography;

/** 后端对密钥字段统一脱敏占位符 */
const MASK_PLACEHOLDER = '******';

/** Cloudflare Turnstile 官方测试密钥（始终通过验证） */
const TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

interface TurnstileFormValues {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
}

/**
 * 系统设置 → Turnstile（对标老项目 配置中心/Turnstile）：
 * 人机验证配置（enabled / siteKey / secretKey），保存到 system_config key=turnstile.config
 * 验证逻辑在登录端点（POST /auth/login 前置校验），本页只负责配置读写
 */
export function TurnstilePage(): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<TurnstileFormValues>();
  const [isLoading, setIsLoading] = useState(true);
  const canUpdate = usePermission('config:turnstile:update');

  const { data } = useTurnstileConfigQuery();
  const [updateConfig, { loading: saving }] = useUpdateTurnstileConfigMutation();

  useEffect(() => {
    if (!data) return;
    const config = data.turnstileConfig;
    if (config) {
      const v = config.value as Record<string, unknown>;
      form.setFieldsValue({
        enabled: (v.enabled as boolean) ?? false,
        siteKey: (v.siteKey as string) || '',
        secretKey: (v.secretKey as string) || '',
      });
    } else {
      form.setFieldsValue({
        enabled: false,
        siteKey: TEST_SITE_KEY,
        secretKey: TEST_SECRET_KEY,
      });
    }
    setIsLoading(false);
  }, [data, form]);

  const handleSubmit = async (): Promise<void> => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const values = form.getFieldsValue();
    const payload: Record<string, unknown> = {
      enabled: values.enabled,
      siteKey: values.siteKey,
    };
    // secretKey 仍是占位符 → 视为未修改，不提交
    if (values.secretKey && values.secretKey !== MASK_PLACEHOLDER) {
      payload.secretKey = values.secretKey;
    }
    try {
      await updateConfig({
        variables: { input: { value: payload } },
      });
      void message.success('Turnstile 配置已保存');
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '保存失败，请重试');
    }
  };

  return (
    <Card title="Turnstile 配置">
      <Spin spinning={isLoading}>
      <Alert
        type="info"
        showIcon
        title="即时生效"
        description="修改 siteKey / secretKey 后立即生效，无需重启服务"
        style={{ marginBottom: 16 }}
      />
      <Form<TurnstileFormValues>
        form={form}
        layout="horizontal"
        labelCol={{ flex: '140px' }}
        labelWrap
      >
        <Form.Item
          label="启用"
          name="enabled"
          valuePropName="checked"
          extra="开启后登录页将显示 Turnstile 人机验证"
        >
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item
          label="站点密钥 (Site Key)"
          name="siteKey"
          rules={[{ required: true, message: '请输入站点密钥 (Site Key)' }]}
          extra="Cloudflare Turnstile 的 Site Key，前端使用（公开可见）"
        >
          <Input placeholder="例如：1x00000000000000000000AA" />
        </Form.Item>
        <Form.Item
          label="密钥 (Secret Key)"
          name="secretKey"
          extra="Cloudflare Turnstile 的 Secret Key，后端验证使用；留占位符 ****** 表示不修改"
        >
          <Input.Password placeholder="请输入 Secret Key" autoComplete="new-password" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" loading={saving} disabled={!canUpdate} onClick={() => void handleSubmit()}>
            保存设置
          </Button>
        </Form.Item>
        {!canUpdate && (
          <Text type="secondary">当前角色无编辑配置权限（config:turnstile:update）</Text>
        )}
      </Form>
      </Spin>
    </Card>
  );
}
