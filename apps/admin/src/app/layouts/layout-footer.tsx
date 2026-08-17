import { Layout, Space, theme } from 'antd';
import { APP_VERSION } from '../version.js';
import { useSystemConfig } from '../providers/system-config-provider.js';

const { Footer } = Layout;

/**
 * 页脚：系统名 + 版本 + 附加文本（后台设置的页脚文本）+ 版权
 * - settings.name：系统名（后台设置）
 * - settings.footerText：可配置附加文本（如备案号/标语）；若含 © 版权信息则不再追加固定版权，避免重复
 * - 版本号 + © 年份 zhengbo 固定展示
 */
export function LayoutFooter(): React.JSX.Element {
  const { token } = theme.useToken();
  const { settings } = useSystemConfig();
  const year = new Date().getFullYear();
  const hasCopyright = (settings.footerText ?? '').includes('©');

  return (
    <Footer
      className="shrink-0 text-center"
      style={{
        padding: `${token.paddingSM}px ${token.paddingLG}px`,
        color: token.colorTextSecondary,
        fontSize: 13,
      }}
    >
      <Space
        separator={<span style={{ color: token.colorTextTertiary }}>·</span>}
        wrap
        size={4}
      >
        <span>{settings.name || 'monorepo-starter'}</span>
        <span>v{APP_VERSION}</span>
        {settings.footerText && <span>{settings.footerText}</span>}
        {!hasCopyright && <span>© {year} zhengbo</span>}
      </Space>
    </Footer>
  );
}
