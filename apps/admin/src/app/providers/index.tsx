import type { ReactNode } from 'react';
import { ThemeProvider } from './theme-provider.js';
import { SettingsProvider } from './settings-provider.js';
import { AntdProvider } from './antd-provider.js';

/**
 * 应用级 Provider 组合（外 → 内）：
 * ThemeProvider → SettingsProvider → AntdProvider
 * - ThemeProvider：亮/暗/跟随系统
 * - SettingsProvider：主色/水印/色弱/布局开关（持久化）
 * - AntdProvider：ConfigProvider(zhCN + 主色 + 算法) + App 上下文
 * 其余业务 Provider（Auth/Apollo/QueryClient）在 App 内组装。
 */
export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AntdProvider>{children}</AntdProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
