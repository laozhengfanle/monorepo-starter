import { Button, ColorPicker, Divider, Drawer, Space, Switch, Typography, theme } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import { useSettings } from '../../app/providers/settings-provider.js';
import { useTheme } from '../../app/providers/theme-provider.js';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 偏好设置抽屉：主色 / 水印 / 色弱 / 布局开关（对标旧版 SettingsDrawer）。
 */
export function SettingsDrawer({ open, onClose }: SettingsDrawerProps): React.JSX.Element {
  const { token } = theme.useToken();
  const {
    primaryColor,
    setPrimaryColor,
    isCustomColor,
    resetPrimaryColor,
    isWatermarkVisible,
    toggleWatermark,
    isColorBlindMode,
    toggleColorBlindMode,
    showTabBar,
    setShowTabBar,
    showBreadcrumb,
    setShowBreadcrumb,
    showFooter,
    setShowFooter,
  } = useSettings();
  const { mode, setMode } = useTheme();

  const themeOptions: { value: 'system' | 'light' | 'dark'; label: string }[] = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '亮色' },
    { value: 'dark', label: '暗色' },
  ];

  return (
    <Drawer title="偏好设置" open={open} onClose={onClose} size={320}>
      <Typography.Text strong>主题模式</Typography.Text>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 24 }}>
        {themeOptions.map((opt) => (
          <Button
            key={opt.value}
            size="small"
            type={mode === opt.value ? 'primary' : 'default'}
            onClick={() => setMode(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <Typography.Text strong>主题色</Typography.Text>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
          marginBottom: 24,
        }}
      >
        <ColorPicker
          value={primaryColor}
          onChange={(color) => setPrimaryColor(color.toHexString())}
          showText
        />
        {isCustomColor && (
          <Button size="small" icon={<UndoOutlined />} onClick={resetPrimaryColor}>
            恢复默认
          </Button>
        )}
      </div>

      <Divider style={{ margin: '12px 0' }} />

      <Typography.Text strong>界面设置</Typography.Text>
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
          }}
        >
          <span>多标签页</span>
          <Switch size="small" checked={showTabBar} onChange={setShowTabBar} />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
          }}
        >
          <span>面包屑</span>
          <Switch size="small" checked={showBreadcrumb} onChange={setShowBreadcrumb} />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
          }}
        >
          <span>页脚</span>
          <Switch size="small" checked={showFooter} onChange={setShowFooter} />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
          }}
        >
          <span>水印</span>
          <Switch size="small" checked={isWatermarkVisible} onChange={toggleWatermark} />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
          }}
        >
          <span>色弱模式</span>
          <Switch size="small" checked={isColorBlindMode} onChange={toggleColorBlindMode} />
        </div>
      </div>

      <Space direction="vertical" style={{ marginTop: 24, width: '100%' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          当前主题色：{primaryColor}（{token.colorPrimary}）
        </Typography.Text>
      </Space>
    </Drawer>
  );
}
