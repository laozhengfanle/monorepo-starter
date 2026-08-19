import { Breadcrumb, FloatButton, Layout, Watermark, theme } from 'antd';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { AdminMenuNode } from '@starter/api-client';
import { useAuth } from '../auth/auth-context.js';
import { useSettings } from '../providers/settings-provider.js';
import { useSystemConfig } from '../providers/system-config-provider.js';
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
export function MainLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const { token } = theme.useToken();
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useSystemConfig();
  const {
    showTabBar,
    showBreadcrumb,
    showFooter,
    isWatermarkVisible,
    watermarkContent,
  } = useSettings();

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

  // 主布局（水印开关 + 内容非空时用 Watermark 包裹整页）
  const layout = (
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
              <Breadcrumb
                items={breadcrumbItems.map((item) => ({ title: item.title }))}
              />
            </div>
          ) : null}

          {/* 滚动容器：minHeight:0 是 flex 子项可滚动的关键，
              否则内容超出会被 overflow-hidden 父级裁掉（footer 不可见） */}
          <Layout
            ref={scrollRef}
            className="flex-1 overflow-auto"
            style={{ minHeight: 0 }}
          >
            {/* 内层包裹：min-height 100% + flex column 实现 sticky footer ——
                内容不足时 Content 撑满、footer 贴底；
                内容多时包裹层随内容变高、footer 被顶到下方滚动可见 */}
            <div
              style={{
                minHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* flex: 1 0 auto —— grow 填充不足空间，shrink 0 防止内容被压缩溢出 */}
              <Content style={{ flex: '1 0 auto', padding: token.paddingLG }}>
                {children}
              </Content>
              {showFooter ? <LayoutFooter /> : null}
            </div>
          </Layout>
        </Layout>
      </Layout>

      <FloatButton.BackTop
        target={() => scrollRef.current as HTMLElement}
        style={{ insetInlineEnd: token.paddingLG }}
      />
    </Layout>
  );

  // 水印优先级：个人偏好（设置抽屉，localStorage）> 后台设置系统水印（全站默认）
  // 变量替换与后台设置预览一致：{{username}} → 当前账户昵称、{{date}} → 当天日期
  const rawWatermark = isWatermarkVisible
    ? watermarkContent
    : settings.watermarkContent;
  const effectiveWatermark = rawWatermark
    ? rawWatermark
        .replace(/\{\{username\}\}/g, user?.nickname || user?.username || '')
        .replace(/\{\{date\}\}/g, new Date().toISOString().slice(0, 10))
    : '';

  return (
    <TabBarProvider>
      {effectiveWatermark ? (
        <Watermark content={effectiveWatermark}>{layout}</Watermark>
      ) : (
        layout
      )}
    </TabBarProvider>
  );
}
