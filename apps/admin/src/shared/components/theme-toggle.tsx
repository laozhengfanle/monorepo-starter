import { Button, Dropdown } from 'antd';
import { LaptopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTheme } from '../../app/providers/theme-provider.js';

/** 主题模式 key（与 ThemeProvider 一致） */
type ThemeMode = 'system' | 'light' | 'dark';

const themeIconMap: Record<ThemeMode, React.ReactNode> = {
  system: <LaptopOutlined />,
  light: <SunOutlined />,
  dark: <MoonOutlined />,
};

const THEME_MENU_ITEMS = [
  { key: 'system', icon: themeIconMap.system, label: '跟随系统' },
  { key: 'light', icon: themeIconMap.light, label: '亮色' },
  { key: 'dark', icon: themeIconMap.dark, label: '暗色' },
];

/**
 * 主题切换按钮（共享组件，Header 与登录页复用）：
 * - 下拉展示 跟随系统/亮色/暗色 三选项，当前模式有选中态（selectable + selectedKeys）
 * - 图标随当前模式切换
 */
export function ThemeToggle(): React.JSX.Element {
  const { mode, setMode } = useTheme();

  return (
    <Dropdown
      trigger={['hover']}
      arrow
      placement="bottomRight"
      menu={{
        items: THEME_MENU_ITEMS,
        selectable: true,
        selectedKeys: [mode],
        onClick: ({ key }) => setMode(key as ThemeMode),
      }}
    >
      <Button icon={themeIconMap[mode]} aria-label="主题切换" />
    </Dropdown>
  );
}
