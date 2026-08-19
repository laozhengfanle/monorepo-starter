import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Image,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from '@starter/api-client';
import {
  useBatchUpdateConfigsMutation,
  useDeleteUploadFileMutation,
  useStorageConfigQuery,
  useUploadFilesQuery,
} from '../../../generated/graphql';
import { usePermission } from '../../../app/auth/use-permission.js';
import { TableToolbar } from '../../../shared/components/table-toolbar.js';
import { useColumnControl } from '../../../shared/hooks/use-column-control.js';

const { Text } = Typography;

/** 配置 key：storage.driver（文件存储驱动） */
const STORAGE_KEY = 'storage.driver';

/** 后端脱敏占位符：密钥已保存时回传该值，前端不再回传以免覆盖 */
const REDACTED_PLACEHOLDER = '******';

/** 是否为脱敏占位符或空值（提交时跳过，保持后端原值） */
function isRedacted(value: string | undefined): boolean {
  return !value || value === REDACTED_PLACEHOLDER;
}

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

/** 文件大小格式化 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 是否为图片（用于预览） */
function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

/**
 * 拼完整可访问地址：本地存储的 url 是相对路径（/uploads/xxx），
 * 云存储驱动可能直接返回完整 URL——已带协议则原样返回，否则拼 window.location.origin。
 */
function toFullUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${window.location.origin}${url}`;
}

/**
 * 系统设置 → 文件存储：
 * 上半部分：存储驱动配置（local/OSS/COS/S3，保存到 system_config.storage.driver）
 * 下半部分：已上传文件管理（列表 / 删除，走存储驱动统一落盘）
 */
export function StorageDriverPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<StorageFormValues>();
  const [isLoading, setIsLoading] = useState(true);
  const canUpdate = usePermission('config:admin:update');
  const canDeleteFile = usePermission('config:file:delete');

  const { data } = useStorageConfigQuery();
  const [batchUpdate, { loading: saving }] = useBatchUpdateConfigsMutation();

  // 文件列表（服务端分页）
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const {
    data: filesData,
    loading: filesLoading,
    refetch,
  } = useUploadFilesQuery({
    variables: { page, pageSize },
    fetchPolicy: 'network-only',
  });
  const [deleteUploadFile] = useDeleteUploadFileMutation();
  const files = (filesData?.uploadFiles.items ?? []) as UploadFile[];

  const loadFiles = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const driver = Form.useWatch('driver', form);
  const isCloud = driver === 's3' || driver === 'oss' || driver === 'cos';

  useEffect(() => {
    if (!data) return;
    const config = data.storageConfig;
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
    // 只提交当前驱动相关字段（避免把无关空值写进 JSON）；
    // 密钥为占位符/留空时不提交该字段（undefined），避免覆盖已保存的密钥
    const value = isCloud
      ? {
          driver: values.driver,
          bucket: values.bucket,
          region: values.region,
          ...(isRedacted(values.accessKey)
            ? {}
            : { accessKey: values.accessKey }),
          ...(isRedacted(values.secretKey)
            ? {}
            : { secretKey: values.secretKey }),
        }
      : { driver: values.driver, localPath: values.localPath };
    try {
      await batchUpdate({
        variables: { input: { updates: [{ key: STORAGE_KEY, value }] } },
      });
      void message.success('存储驱动配置已保存');
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : '保存失败，请重试',
      );
    }
  };

  const handleDeleteFile = async (id: string): Promise<void> => {
    try {
      await deleteUploadFile({ variables: { id } });
      void message.success('文件已删除');
      await loadFiles();
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : '删除失败，请重试',
      );
    }
  };

  // 图片预览（受控）：点「查看」/缩略图时设置，antd Image 预览浮层打开，关闭后清空
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /** 复制文件完整地址到剪贴板（navigator.clipboard 失败回退 execCommand） */
  const handleCopy = async (record: UploadFile): Promise<void> => {
    const fullUrl = toFullUrl(record.url);
    const fallback = (): boolean => {
      try {
        const ta = document.createElement('textarea');
        ta.value = fullUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };
    try {
      await navigator.clipboard.writeText(fullUrl);
      void message.success('地址已复制');
    } catch {
      if (fallback()) {
        void message.success('地址已复制');
      } else {
        void message.error('复制失败，请手动复制');
      }
    }
  };

  /** 导出文件列表 CSV（改用 useColumnControl 的 handleExport：导可见列 + 列控制三要素统一） */
  const fullColumns: ColumnsType<UploadFile> = [
    {
      title: '文件名',
      dataIndex: 'originalName',
      key: 'originalName',
      width: 220,
      render: (v: string, record) =>
        isImage(record.mimeType) ? (
          <Space size={8}>
            {/* 图片：点击缩略图触发 antd Image 预览（不走新窗口） */}
            <Image
              width={32}
              height={32}
              src={record.url}
              alt={v}
              preview={{ src: toFullUrl(record.url) }}
              style={{ objectFit: 'cover', borderRadius: 4 }}
            />
            <span>{v}</span>
          </Space>
        ) : (
          <span>{v}</span>
        ),
    },
    {
      title: '类型',
      dataIndex: 'mimeType',
      key: 'mimeType',
      width: 140,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 90,
      render: (v: number) => formatSize(v),
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => <span>{v.replace('T', ' ').slice(0, 19)}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_v, record) => (
        <Space size="small">
          {isImage(record.mimeType) ? (
            // 图片：点「查看」打开 antd Image 预览（不弹新窗口）
            <Button
              type="link"
              size="small"
              onClick={() => setPreviewUrl(toFullUrl(record.url))}
            >
              查看
            </Button>
          ) : (
            // 非图片（pdf/word 等）：保持新窗口打开
            <Button type="link" size="small" href={record.url} target="_blank">
              查看
            </Button>
          )}
          <Button
            type="link"
            size="small"
            onClick={() => void handleCopy(record)}
          >
            复制
          </Button>
          {canDeleteFile && (
            <Popconfirm
              title="确认删除该文件？"
              description="将同时删除存储中的物理文件，不可恢复"
              onConfirm={() => void handleDeleteFile(record.id)}
            >
              <Button color="danger" variant="link" size="small">
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // 列控制 + 导出（三要素：列控制 / 导出 / 刷新）
  const { columnMenuItems, columns, handleExport } =
    useColumnControl<UploadFile>({
      fullColumns,
      initialVisibleKeys: [
        'originalName',
        'mimeType',
        'size',
        'createdAt',
        'actions',
      ],
      exportFileNamePrefix: '文件列表',
      exportData: files,
      exportCell: (key, f) => (key === 'size' ? formatSize(f.size) : undefined),
    });

  return (
    <div>
      <Card title="存储驱动">
        <Spin spinning={isLoading}>
          <Alert
            type="info"
            showIcon
            title="默认本地存储（uploads/ 目录）；云存储（OSS/COS/S3）驱动已预留，填写配置后切换"
            style={{ marginBottom: 16 }}
          />
          <Form<StorageFormValues>
            form={form}
            layout="horizontal"
            labelCol={{ flex: '140px' }}
            labelWrap
            initialValues={{ driver: 'local', localPath: './uploads' }}
          >
            <Form.Item
              label="驱动"
              name="driver"
              rules={[{ required: true, message: '请选择存储驱动' }]}
            >
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
                <Form.Item
                  label="Bucket"
                  name="bucket"
                  rules={[{ required: true, message: '请输入 Bucket 名称' }]}
                >
                  <Input placeholder="存储桶名称" />
                </Form.Item>
                <Form.Item
                  label="Region"
                  name="region"
                  rules={[{ required: true, message: '请输入 Region 地域' }]}
                >
                  <Input placeholder="如 oss-cn-hangzhou、ap-singapore" />
                </Form.Item>
                <Form.Item
                  label="AccessKey"
                  name="accessKey"
                  extra="密钥留空或保持 ****** 表示保持原值，不覆盖已保存的密钥"
                >
                  <Input placeholder="AccessKey ID" />
                </Form.Item>
                <Form.Item
                  label="SecretKey"
                  name="secretKey"
                  extra="密钥留空或保持 ****** 表示保持原值，不覆盖已保存的密钥"
                >
                  <Input.Password placeholder="SecretKey" />
                </Form.Item>
              </>
            )}

            <Form.Item label=" " colon={false}>
              <Button
                type="primary"
                loading={saving}
                disabled={!canUpdate}
                onClick={() => void handleSubmit()}
              >
                保存设置
              </Button>
            </Form.Item>
            {!canUpdate && (
              <Text type="secondary">
                当前角色无编辑配置权限（config:admin:update）
              </Text>
            )}
          </Form>
        </Spin>
      </Card>

      <Card
        title="已上传文件"
        style={{ marginTop: 16 }}
        extra={
          <TableToolbar
            columnMenuItems={columnMenuItems}
            onExport={handleExport}
            onRefresh={() => void loadFiles()}
          />
        }
      >
        <Table<UploadFile>
          rowKey="id"
          columns={columns}
          dataSource={files}
          loading={filesLoading}
          locale={{ emptyText: '暂无文件' }}
          pagination={{
            current: page,
            pageSize,
            total: filesData?.uploadFiles.total ?? 0,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 个文件`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* 图片预览浮层（受控）：隐藏的 img 仅作锚点，预览在 portal 中打开 */}
      {previewUrl && (
        <Image
          src={previewUrl}
          alt="文件预览"
          style={{ display: 'none' }}
          preview={{
            visible: true,
            onVisibleChange: (visible) => {
              if (!visible) setPreviewUrl(null);
            },
          }}
        />
      )}
    </div>
  );
}
