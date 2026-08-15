import type { ThemeConfig } from 'antd';

/**
 * 设计 token 单一来源：所有应用的 antd 主题从这里派生。
 * 替换品牌色等 seed token 时只改这里，禁止在组件里硬编码色值。
 */
export const brandTokens = {
  colorPrimary: '#1677ff',
  borderRadius: 3,
  fontSize: 14,
} satisfies ThemeConfig['token'];

export const themeConfig: ThemeConfig = {
  token: brandTokens,
};
