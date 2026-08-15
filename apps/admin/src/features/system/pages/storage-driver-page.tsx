import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Select, Spin, Typography } from 'antd';
import { useAdminConfigsQuery, useBatchUpdateConfigsMutation } from '../../../generated/graphql';
import { usePermission } from '../../../app/auth/use-permission.js';

const { Text } = Typography;

/** 配置 key：storage.driver（文件存储驱动） */
const STORAGE_KEY = 'storage.driver';

/** 存储驱动选项 */
const driverOptions = [
  { label: '本地存储', value: 'local' },
  { label: '阿里云 OSS', value: 'oss' },
  { label: '腾讯云 COS', value: 'cos' },
  { label: 'AWS S3', value: 's3' },
];

interface StorageFormValues {
  driver: 'local' | 'oss' | 'cos' | 's3';
  localPath: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

/**
 * 系统设置 → 文件存储（对标老项目 配置中心/文件存储）：
 * 驱动选择（local/OSS/COS/S3）+ 动态字段，保存到 system_config key=storage.driver
 * 说明：本页为配置表单（非文件列表）；上传文件列表属于 UploadFile 管理，不在本页范围
 */
export function StorageDriverPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<StorageFormValues>();
  const [isLoading, setIsLoading] = useState(true);
  const canUpdate = usePermission('config:admin:update');

  const { data } = useAdminConfigsQuery();
  const [batchUpdate, { loading: saving }] = useBatchUpdateConfigsMutation();

  const driver = Form.useWatch('driver', form);
  const isCloud = driver === 's3' || driver === 'oss' || driver === 'cos';

  useEffect(() => {
    if (!data) return;
    const config = data.adminConfigs.find((c) => c.key === STORAGE_KEY);
    if (config) {
      const v = config.value as Record<string, unknown>;
      form.setFieldsValue({
        driver: (v.driver as StorageFormValues['driver']) ?? 'local',
        localPath: (v.localPath as string) ?? './uploads',
        bucket: (v.bucket as string) ?? '',
        region: (v.region as string) ?? '',
        accessKey: (v.accessKey as string) ?? '',
        secretKey: (v.secretKey as string) ?? '',
      });
    } else {
      form.setFieldsValue({ driver: 'local', localPath: './uploads' });
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
    // 只提交当前驱动相关字段（避免把无关空值写进 JSON）
    const value = isCloud
      ? {
          driver: values.driver,
          bucket: values.bucket,
          region: values.region,
          accessKey: values.accessKey,
          secretKey: values.secretKey,
        }
      : { driver: values.driver, localPath: values.localPath };
    try {
      await batchUpdate({
        variables: { input: { updates: [{ key: STORAGE_KEY, value }] } },
      });
      void message.success('存储驱动配置已保存');
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '保存失败，请重试');
    }
  };

  return (
    <Card title="存储驱动">
      <Spin spinning={isLoading}>
      <Alert
        type="info"
        showIcon
        title="本地存储无需额外配置；云存储（OSS/COS/S3）需填写对应密钥"
        style={{ marginBottom: 16 }}
      />
      <Form<StorageFormValues>
        form={form}
        layout="horizontal"
        labelCol={{ flex: '140px' }}
        labelWrap
        initialValues={{ driver: 'local', localPath: './uploads' }}
      >
        <Form.Item label="驱动" name="driver" rules={[{ required: true, message: '请选择存储驱动' }]}>
          <Select options={driverOptions} placeholder="请选择存储驱动" />
        </Form.Item>

        {!isCloud && (
          <Form.Item
            label="本地路径"
            name="localPath"
            rules={[{ required: true, message: '请输入本地存储路径' }]}
            extra="服务器本地磁盘目录，需确保有写入权限"
          >
            <Input placeholder="./uploads" />
          </Form.Item>
        )}

        {isCloud && (
          <>
            <Form.Item label="Bucket" name="bucket" rules={[{ required: true, message: '请输入 Bucket 名称' }]}>
              <Input placeholder="存储桶名称" />
            </Form.Item>
            <Form.Item label="Region" name="region" rules={[{ required: true, message: '请输入 Region 地域' }]}>
              <Input placeholder="如 oss-cn-hangzhou、ap-singapore" />
            </Form.Item>
            <Form.Item
              label="AccessKey"
              name="accessKey"
              rules={[{ required: true, message: '请输入 AccessKey' }]}
            >
              <Input placeholder="AccessKey ID" />
            </Form.Item>
            <Form.Item label="SecretKey" name="secretKey" rules={[{ required: true, message: '请输入 SecretKey' }]}>
              <Input.Password placeholder="SecretKey" />
            </Form.Item>
          </>
        )}

        <Form.Item>
          <Button type="primary" loading={saving} disabled={!canUpdate} onClick={() => void handleSubmit()}>
            保存设置
          </Button>
        </Form.Item>
        {!canUpdate && (
          <Text type="secondary">当前角色无编辑配置权限（config:admin:update）</Text>
        )}
      </Form>
      </Spin>
    </Card>
  );
}
