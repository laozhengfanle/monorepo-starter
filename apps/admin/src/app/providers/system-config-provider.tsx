import { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/auth-context.js';
import type { ReactNode } from 'react';
import { useAdminConfigsQuery, usePublicConfigsQuery } from '../../generated/graphql';

/** 系统配置 key */
const SETTINGS_KEY = 'settings';

/** 后台设置（system_config.settings）解析后的形态，供 Header/Footer/登录页等消费 */
export interface SystemSettings {
  /** 系统名称（Header 品牌名 / document.title） */
  name: string;
  /** 系统 Logo（Header 品牌图） */
  logo: string;
  /** 页脚文本（Footer 版权信息） */
  footerText: string;
  /** 密码最小长度（登录/改密校验） */
  passwordMinLength: number;
  /** 登录失败锁定阈值（次） */
  loginFailThreshold: number;
  /** 账号锁定时长（分钟） */
  lockDuration: number;
  /** 密码复杂度：low/medium/high */
  passwordComplexity: 'low' | 'medium' | 'high';
  /** 水印内容（留空不显示） */
  watermarkContent: string;
}

interface SystemConfigContextValue {
  /** 后台设置配置（加载完成前为默认值） */
  settings: SystemSettings;
  /** 是否已从后端加载 */
  loaded: boolean;
}

const DEFAULT_SETTINGS: SystemSettings = {
  name: 'monorepo-starter',
  logo: '',
  footerText: '',
  passwordMinLength: 8,
  loginFailThreshold: 5,
  lockDuration: 30,
  passwordComplexity: 'medium',
  watermarkContent: '',
};

const SystemConfigContext = createContext<SystemConfigContextValue | null>(null);

export const useSystemConfig = (): SystemConfigContextValue => {
  const ctx = useContext(SystemConfigContext);
  if (!ctx) {
    throw new Error('useSystemConfig 必须在 SystemConfigProvider 内使用');
  }
  return ctx;
};

/**
 * 系统配置 Provider（对标老项目 Vue configStore）：
 * 挂载时从后端加载 system_config.settings，供 Header 品牌名/Logo、Footer 版权、
 * 登录/改密校验等消费。放在 ApolloProvider 内层（依赖 GraphQL hook）。
 */
export function SystemConfigProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // 未登录（登录页）用公开配置（publicConfigs，无需鉴权，敏感字段已脱敏）；
  // 登录后用管理端配置（adminConfigs）。登录状态切换时自动重查。
  const { user } = useAuth();
  const { data: publicData } = usePublicConfigsQuery({
    skip: !!user,
    fetchPolicy: 'network-only',
  });
  const { data: adminData } = useAdminConfigsQuery({
    skip: !user,
    fetchPolicy: 'network-only',
  });

  // 未登录读 publicConfigs，登录后读 adminConfigs（两者字段名不同，分开取值）
  const rawConfigs = user
    ? (adminData?.adminConfigs ?? null)
    : (publicData?.publicConfigs ?? null);

  const value = useMemo<SystemConfigContextValue>(() => {
    const config = rawConfigs?.find((c) => c.key === SETTINGS_KEY);
    if (!config) {
      return { settings: DEFAULT_SETTINGS, loaded: false };
    }
    const v = config.value as Record<string, unknown>;
    return {
      loaded: true,
      settings: {
        name: (v.name as string) || DEFAULT_SETTINGS.name,
        logo: (v.logo as string) || '',
        footerText: (v.footerText as string) || '',
        passwordMinLength: (v.passwordMinLength as number) ?? DEFAULT_SETTINGS.passwordMinLength,
        loginFailThreshold:
          (v.loginFailThreshold as number) ?? DEFAULT_SETTINGS.loginFailThreshold,
        lockDuration: (v.lockDuration as number) ?? DEFAULT_SETTINGS.lockDuration,
        passwordComplexity:
          ((v.passwordComplexity as SystemSettings['passwordComplexity']) ??
            DEFAULT_SETTINGS.passwordComplexity),
        watermarkContent: (v.watermarkContent as string) || '',
      },
    };
  }, [rawConfigs]);

  // 配置加载后同步浏览器标签标题（对标老项目 SettingsPage 保存时 document.title）
  const { settings } = value;
  useEffect(() => {
    if (value.loaded && settings.name) {
      document.title = settings.name;
    }
  }, [value.loaded, settings.name]);

  return (
    <SystemConfigContext.Provider value={value}>{children}</SystemConfigContext.Provider>
  );
}
