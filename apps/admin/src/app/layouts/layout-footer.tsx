import { Layout, theme } from 'antd';
import { APP_VERSION } from '../version.js';

const { Footer } = Layout;

/** 页脚 */
export function LayoutFooter(): React.JSX.Element {
  const { token } = theme.useToken();

  return (
    <Footer
      className="shrink-0 text-center"
      style={{
        padding: `${token.paddingSM}px ${token.paddingLG}px`,
        color: token.colorTextSecondary,
      }}
    >
      monorepo-starter v{APP_VERSION} ©{new Date().getFullYear()} Created with Ant Design
    </Footer>
  );
}
