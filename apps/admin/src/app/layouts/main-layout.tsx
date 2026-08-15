import { Breadcrumb, FloatButton, Layout, theme } from 'antd';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { AdminMenuNode } from '@starter/api-client';
import { useAuth } from '../auth/auth-context.js';
import { useSettings } from '../providers/settings-provider.js';
import { LayoutHeader } from './layout-header.js';
import { LayoutSidebar } from './layout-sidebar.js';
import { LayoutFooter } from './layout-footer.js';
import { TabBarProvider } from './tab-bar-provider.js';
import { TabBar } from './tab-bar.js';

const { Content } = Layout;

/** 从菜单树中查找 path 对应节点的祖先链（含自身），生成面包屑 */
function findBreadcrumb(
  nodes: AdminMenuNode[],
  path: string,
): { title: string; href?: string }[] {
  for (const node of nodes) {
    if (node.type === 'button') continue;
    if (node.path === path) {
      return [{ title: node.name }];
    }
    if (node.children?.length) {
      const childCrumb = findBreadcrumb(node.children, path);
      if (childCrumb.length > 0) {
        return [{ title: node.name }, ...childCrumb];
      }
    }
  }
  return [];
}

/**
 * 中后台主布局（对标旧版 MainLayout）：
 * 顶栏 Header → 左侧 Sider（响应式折叠）→ 标签栏 + 面包屑 + 内容 + 页脚。
 * 布局显隐（标签栏/面包屑/页脚）由偏好设置控制。
 */
export function MainLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const { token } = theme.useToken();
  const location = useLocation();
  const { user } = useAuth();
  const { showTabBar, showBreadcrumb, showFooter } = useSettings();

  // userCollapsed：用户手动收起；belowLg：视口 < lg 强制收起
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [belowLg, setBelowLg] = useState(false);
  const collapsed = userCollapsed || belowLg;
  const scrollRef = useRef<HTMLDivElement>(null);

  const breadcrumbItems = useMemo(() => {
    const path = location.pathname;
    if (path === '/') {
      return [{ title: '仪表盘' }];
    }
    return findBreadcrumb(user?.menus ?? [], path);
  }, [location.pathname, user?.menus]);

  return (
    <TabBarProvider>
      <Layout className="h-screen">
        <LayoutHeader />

        <Layout hasSider className="flex-1 overflow-hidden">
          <LayoutSidebar
            collapsed={collapsed}
            onToggle={() => setUserCollapsed((prev) => !prev)}
            onBreakpoint={setBelowLg}
          />

          <Layout className="overflow-hidden">
            {showTabBar ? <TabBar /> : null}

            {showBreadcrumb && breadcrumbItems.length > 0 ? (
              <div
                className="shrink-0"
                style={{
                  padding: `${token.paddingSM}px ${token.paddingLG}px`,
                  background: token.colorBgContainer,
                }}
              >
                <Breadcrumb items={breadcrumbItems.map((item) => ({ title: item.title }))} />
              </div>
            ) : null}

            <Layout ref={scrollRef} className="flex-1 overflow-auto">
              <Content
                className="grow shrink-0 basis-auto"
                style={{ padding: token.paddingLG }}
              >
                {children}
              </Content>
            </Layout>

            {/* 页脚固定在视口底部，不随内容滚动 */}
            {showFooter ? <LayoutFooter /> : null}
          </Layout>
        </Layout>

        <FloatButton.BackTop
          target={() => scrollRef.current as HTMLElement}
          style={{ insetInlineEnd: token.paddingLG }}
        />
      </Layout>
    </TabBarProvider>
  );
}
