import { useEffect, useState } from 'react';
import { CheckOutlined } from '@ant-design/icons';
import {
  Button,
  ColorPicker,
  Divider,
  Drawer,
  Input,
  Segmented,
  Space,
  Switch,
  Typography,
  theme,
} from 'antd';
import {
  DEFAULT_PRIMARY_COLOR,
  isValidHexColor,
  useSettings,
} from '../../app/providers/settings-provider.js';
import { useTheme } from '../../app/providers/theme-provider.js';

const { Title: AntTitle, Text } = Typography;

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** 主题模式（与老项目 themeModes 对齐） */
const themeModes = [
  { value: 'system' as const, label: '自动' },
  { value: 'light' as const, label: '亮色' },
  { value: 'dark' as const, label: '暗色' },
];

/** 主色预设（与老项目 presetColors 对齐） */
const presetColors = [
  '#18A058',
  '#1677FF',
  '#409EFF',
  '#722ED1',
  '#F5222D',
  '#FA8C16',
  '#13C2C2',
  '#52C41A',
  '#EB2F96',
  '#FAAD14',
];

/** 把 antd Color 对象 / 字符串归一化成 hex（小写） */
function toHexString(color: unknown): string {
  if (!color) return '';
  const c = color as { toHexString?: () => string };
  if (typeof c.toHexString === 'function') return c.toHexString().toLowerCase();
  if (typeof color === 'string') return color.toLowerCase();
  return '';
}

/** 分节标题：左侧 3px 色条 + 文字（与老项目 section-title 视觉一致） */
function SectionTitle({ title }: { title: string }): React.JSX.Element {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span
        style={{
          display: 'inline-block',
          width: 3,
          height: 14,
          borderRadius: 2,
          background: token.colorPrimary,
        }}
      />
      <AntTitle level={5} style={{ margin: 0, fontSize: 14 }}>
        {title}
      </AntTitle>
    </div>
  );
}

/** 二级标签 */
function SubsectionLabel({ text }: { text: string }): React.JSX.Element {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{text}</div>
  );
}

/** 单行开关：左侧 label + 描述，右侧 switch（整行可点） */
function OptionRow({
  id,
  label,
  desc,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 4px',
        borderRadius: 6,
        cursor: 'pointer',
        gap: 16,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5 }}>
          {desc}
        </Text>
      </div>
      <Switch id={id} checked={checked} onChange={onChange} />
    </label>
  );
}

/**
 * 偏好设置抽屉（完整移植老项目 SettingsDrawer）：
 * - 界面显示：主题模式（Segmented）、主题色（预设色块 + 取色器 + HEX 输入 + 当前色 + 恢复默认）、水印、色弱
 * - 布局选项：标签栏 / 页脚 / 面包屑显隐
 */
export function SettingsDrawer({ open, onClose }: SettingsDrawerProps): React.JSX.Element {
  const { token } = theme.useToken();
  const { mode, setMode } = useTheme();
  const {
    primaryColor,
    setPrimaryColor,
    isCustomColor,
    resetPrimaryColor,
    isWatermarkVisible,
    setWatermarkVisible,
    isColorBlindMode,
    setColorBlindMode,
    showTabBar,
    setShowTabBar,
    showBreadcrumb,
    setShowBreadcrumb,
    showFooter,
    setShowFooter,
  } = useSettings();

  // HEX 输入缓冲：仅在合法 hex 时才提交到 store
  const [colorInput, setColorInput] = useState(primaryColor);
  useEffect(() => {
    setColorInput(primaryColor);
  }, [primaryColor]);

  const commitColor = (value: string): void => {
    setColorInput(value);
    if (isValidHexColor(value)) {
      setPrimaryColor(value.toLowerCase());
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={400}
      title="应用设置"
      destroyOnHidden
    >
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        {/* ===== 界面显示 ===== */}
        <section style={{ width: '100%' }}>
          <SectionTitle title="界面显示" />

          <SubsectionLabel text="主题模式" />
          <Segmented
            block
            value={mode}
            onChange={(v) => setMode(v as 'system' | 'light' | 'dark')}
            options={themeModes.map((m) => ({ value: m.value, label: m.label }))}
            style={{ marginBottom: 16 }}
          />

          <Divider style={{ margin: '12px 0' }} />

          <SubsectionLabel text="主题色" />
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            自定义应用的主色调，将应用于按钮、链接等所有强调元素
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {presetColors.map((c) => {
              const active = primaryColor.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={`选择主题色 ${c}`}
                  onClick={() => commitColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: active ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
                    backgroundColor: c,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    outline: 'none',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.15)';
                    e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.18)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = '';
                  }}
                >
                  {active ? <CheckOutlined style={{ color: '#fff', fontSize: 14 }} /> : null}
                </button>
              );
            })}
          </div>

          <Space.Compact style={{ width: '100%' }}>
            <ColorPicker
              value={primaryColor}
              onChange={(c) => commitColor(toHexString(c))}
              showText
              format="hex"
              presets={[{ label: '推荐', colors: presetColors }]}
            />
            <Input
              value={colorInput}
              placeholder={DEFAULT_PRIMARY_COLOR}
              onChange={(e) => commitColor(e.target.value)}
              style={{ width: 140, fontFamily: 'monospace' }}
              allowClear
            />
          </Space.Compact>

          <div
            style={{
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
            }}
          >
            <Text type="secondary">当前</Text>
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: `1px solid ${token.colorBorder}`,
                backgroundColor: primaryColor,
              }}
            />
            <Text code style={{ fontSize: 12 }}>
              {primaryColor}
            </Text>
            {isCustomColor ? (
              <Button type="link" size="small" onClick={resetPrimaryColor}>
                恢复默认
              </Button>
            ) : null}
          </div>

          <Divider style={{ margin: '12px 0' }} />

          <OptionRow
            id="settings-watermark"
            label="界面水印"
            desc="页面背景显示水印文字，防止截图泄露（待水印组件实现后生效）"
            checked={isWatermarkVisible}
            onChange={setWatermarkVisible}
          />
          <OptionRow
            id="settings-colorblind"
            label="色弱模式"
            desc="增强色觉辅助，帮助色觉障碍用户区分界面元素"
            checked={isColorBlindMode}
            onChange={setColorBlindMode}
          />
        </section>

        <Divider style={{ margin: '4px 0' }} />

        {/* ===== 布局选项 ===== */}
        <section style={{ width: '100%' }}>
          <SectionTitle title="布局选项" />
          <OptionRow
            id="settings-tabbar"
            label="显示选项卡"
            desc="顶部标签栏，用于快速切换已打开的页面"
            checked={showTabBar}
            onChange={setShowTabBar}
          />
          <OptionRow
            id="settings-footer"
            label="显示页脚"
            desc="页面底部的版权信息和链接"
            checked={showFooter}
            onChange={setShowFooter}
          />
          <OptionRow
            id="settings-breadcrumb"
            label="显示面包屑"
            desc="内容区顶部的面包屑导航路径"
            checked={showBreadcrumb}
            onChange={setShowBreadcrumb}
          />
        </section>

        <Text type="secondary" style={{ fontSize: 12 }}>
          说明：偏好设置仅保存在当前浏览器本地，切换设备或清除浏览器数据后需要重新设置。
        </Text>
      </Space>
    </Drawer>
  );
}
