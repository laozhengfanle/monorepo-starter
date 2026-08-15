import { theme as antdTheme } from 'antd';
import { createContext, useContext, useEffect, useMemo } from 'react';
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
 * - 模式持久化到 localStorage
 * - 监听系统主题变化（system 模式实时跟随）
 * - 同步 html[data-theme] 与 .dark class（供 Tailwind dark: 变体使用）
 */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setMode] = usePersistedState<ThemeMode>('theme-mode', 'system');
  const [systemDark, setSystemDark] = usePersistedState<boolean>('theme-system-is-dark', systemIsDark());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setSystemDark]);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode,
      resolved,
      algorithm: resolved === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    }),
    [mode, setMode, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
