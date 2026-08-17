import { theme as antdTheme } from 'antd';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { usePersistedState } from './use-persisted-state.js';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** 解析后的实际主题（system 模式下跟随系统） */
  resolved: 'light' | 'dark';
  /** antd 主题算法（亮/暗） */
  algorithm: typeof antdTheme.defaultAlgorithm | typeof antdTheme.darkAlgorithm;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用');
  }
  return ctx;
};

function systemIsDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * 主题模式 Provider：system（跟随系统）/ light / dark。
 * - mode 持久化到 localStorage（用户选择）
 * - system 模式下实时跟随系统主题（matchMedia 监听，不持久化系统值——系统值随时会变）
 * - 同步 html[data-theme] 与 .dark class（供 Tailwind dark: 变体使用）
 */
export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [mode, setMode] = usePersistedState<ThemeMode>('theme-mode', 'system');
  // 系统主题只存内存（useState）：持久化会导致"上午跟随系统却显示暗色"的旧值残留 bug
  const [systemDark, setSystemDark] = useState<boolean>(() => systemIsDark());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode,
      resolved,
      algorithm:
        resolved === 'dark'
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
    }),
    [mode, setMode, resolved],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
