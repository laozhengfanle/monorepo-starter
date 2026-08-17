import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import { usePersistedState } from './use-persisted-state.js';

/** antd 默认主色 */
export const DEFAULT_PRIMARY_COLOR = '#1677ff';

/** 合法 hex 颜色校验（#RGB / #RRGGBB / #RRGGBBAA） */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const isValidHexColor = (value: string): boolean =>
  HEX_COLOR_RE.test(value);

interface SettingsContextValue {
  /** 当前主色（hex 字符串） */
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  /** 是否使用了非默认主色 */
  isCustomColor: boolean;
  /** 恢复默认主色 */
  resetPrimaryColor: () => void;

  /** 界面水印是否可见 */
  isWatermarkVisible: boolean;
  setWatermarkVisible: (v: boolean) => void;
  toggleWatermark: () => void;
  /** 界面水印文字内容（空字符串则不渲染水印） */
  watermarkContent: string;
  setWatermarkContent: (v: string) => void;

  /** 色弱模式（html.color-blind） */
  isColorBlindMode: boolean;
  setColorBlindMode: (v: boolean) => void;
  toggleColorBlindMode: () => void;

  /** 布局：标签栏可见性 */
  showTabBar: boolean;
  setShowTabBar: (v: boolean) => void;
  /** 布局：面包屑可见性 */
  showBreadcrumb: boolean;
  setShowBreadcrumb: (v: boolean) => void;
  /** 布局：页脚可见性 */
  showFooter: boolean;
  setShowFooter: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const useSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings 必须在 SettingsProvider 内使用');
  }
  return ctx;
};

/**
 * 偏好设置 Provider（对标旧版 SettingsProvider）：
 * 主色 / 水印 / 色弱 / 布局开关，全部持久化到 localStorage。
 */
export function SettingsProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [primaryColor, setPrimaryColorRaw] = usePersistedState<string>(
    'settings-primary-color',
    DEFAULT_PRIMARY_COLOR,
  );
  const setPrimaryColor = useCallback(
    (color: string) => {
      if (isValidHexColor(color)) {
        setPrimaryColorRaw(color.toLowerCase());
      }
    },
    [setPrimaryColorRaw],
  );
  const isCustomColor =
    primaryColor.toLowerCase() !== DEFAULT_PRIMARY_COLOR.toLowerCase();
  const resetPrimaryColor = useCallback(
    () => setPrimaryColorRaw(DEFAULT_PRIMARY_COLOR),
    [setPrimaryColorRaw],
  );

  const [isWatermarkVisible, setWatermarkVisible] = usePersistedState<boolean>(
    'settings-watermark-visible',
    false,
  );
  const toggleWatermark = useCallback(
    () => setWatermarkVisible((prev) => !prev),
    [setWatermarkVisible],
  );
  const [watermarkContent, setWatermarkContent] = usePersistedState<string>(
    'settings-watermark-content',
    '',
  );

  const [isColorBlindMode, setColorBlindMode] = usePersistedState<boolean>(
    'settings-color-blind',
    false,
  );
  const toggleColorBlindMode = useCallback(
    () => setColorBlindMode((prev) => !prev),
    [setColorBlindMode],
  );

  useEffect(() => {
    document.documentElement.classList.toggle('color-blind', isColorBlindMode);
  }, [isColorBlindMode]);

  const [showTabBar, setShowTabBar] = usePersistedState<boolean>(
    'settings-show-tabbar',
    true,
  );
  const [showBreadcrumb, setShowBreadcrumb] = usePersistedState<boolean>(
    'settings-show-breadcrumb',
    true,
  );
  const [showFooter, setShowFooter] = usePersistedState<boolean>(
    'settings-show-footer',
    true,
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      primaryColor,
      setPrimaryColor,
      isCustomColor,
      resetPrimaryColor,
      isWatermarkVisible,
      setWatermarkVisible,
      toggleWatermark,
      watermarkContent,
      setWatermarkContent,
      isColorBlindMode,
      setColorBlindMode,
      toggleColorBlindMode,
      showTabBar,
      setShowTabBar,
      showBreadcrumb,
      setShowBreadcrumb,
      showFooter,
      setShowFooter,
    }),
    [
      primaryColor,
      setPrimaryColor,
      isCustomColor,
      resetPrimaryColor,
      isWatermarkVisible,
      setWatermarkVisible,
      toggleWatermark,
      watermarkContent,
      setWatermarkContent,
      isColorBlindMode,
      setColorBlindMode,
      toggleColorBlindMode,
      showTabBar,
      setShowTabBar,
      showBreadcrumb,
      setShowBreadcrumb,
      showFooter,
      setShowFooter,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
