import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';
import { useTheme } from './theme-provider.js';
import { useSettings, DEFAULT_PRIMARY_COLOR } from './settings-provider.js';

/**
 * antd Provider：注入 ConfigProvider（zhCN + 主色 + 亮/暗算法）+ App 上下文。
 * 必须放在 SettingsProvider 内层（读取主色）与 ThemeProvider 内层（读取算法）。
 */
export function AntdProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { algorithm } = useTheme();
  const { primaryColor } = useSettings();

  return (
    <ConfigProvider
      locale={zhCN}
      componentSize="middle"
      theme={{
        token: {
          colorPrimary: primaryColor || DEFAULT_PRIMARY_COLOR,
          borderRadius: 3,
        },
        algorithm,
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
