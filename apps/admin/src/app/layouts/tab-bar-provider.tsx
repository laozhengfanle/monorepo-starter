import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AdminMenuNode } from '@starter/api-client';
import { useAuth } from '../auth/auth-context.js';

export interface TabItem {
  key: string;
  label: string;
  closable: boolean;
}

interface TabBarContextValue {
  tabs: TabItem[];
  activeKey: string;
  onTabClick: (key: string) => void;
  onTabClose: (key: string) => void;
  onCloseCurrent: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onReload: () => void;
}

const TabBarContext = createContext<TabBarContextValue | null>(null);

export const useTabBar = (): TabBarContextValue => {
  const ctx = useContext(TabBarContext);
  if (!ctx) {
    throw new Error('useTabBar 必须在 TabBarProvider 内使用');
  }
  return ctx;
};

/** 首页 tab（Dashboard），不可关闭 */
const HOME_TAB: TabItem = { key: '/', label: '仪表盘', closable: false };

/** 从菜单树收集可见 menu 节点的 path → 名称（按钮/目录不参与） */
function collectMenuPaths(menus: AdminMenuNode[]): { paths: Set<string>; labels: Record<string, string> } {
  const paths = new Set<string>();
  const labels: Record<string, string> = {};

  const walk = (nodes: AdminMenuNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'button') continue;
      if (node.type === 'menu' && node.path) {
        paths.add(node.path);
        labels[node.path] = node.name;
      }
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(menus);

  return { paths, labels };
}

/**
 * 多标签页 Provider：路由变化自动添加标签；
 * 仅"侧栏可见菜单"对应的路径才进标签栏（侧栏看不到的 tab 不显示）。
 * 不持久化：刷新/重登后回到首页。
 */
export function TabBarProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth();
  const [tabs, setTabs] = useState<TabItem[]>([HOME_TAB]);
  const [activeKey, setActiveKey] = useState<string>(HOME_TAB.key);
  const location = useLocation();
  const navigate = useNavigate();

  const { paths: validPaths, labels: routeLabels } = useMemo(
    () => collectMenuPaths(user?.menus ?? []),
    [user?.menus],
  );

  useEffect(() => {
    const path = location.pathname;
    if (path === '/redirect' || path === '/' || path === '') return;
    if (!validPaths.has(path)) return;

    setTabs((prev) => {
      if (prev.find((t) => t.key === path)) return prev;
      return [...prev, { key: path, label: routeLabels[path] || path, closable: true }];
    });
    setActiveKey(path);
  }, [location.pathname, validPaths, routeLabels]);

  const onTabClick = useCallback(
    (key: string) => {
      setActiveKey(key);
      navigate(key);
    },
    [navigate],
  );

  const onTabClose = useCallback(
    (key: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.key === key);
        const next = prev.filter((t) => t.key !== key);
        if (next.length === 0) {
          setActiveKey(HOME_TAB.key);
          navigate(HOME_TAB.key);
          return [HOME_TAB];
        }
        if (key === activeKey) {
          const target = next[Math.min(idx, next.length - 1)];
          setActiveKey(target.key);
          navigate(target.key);
        }
        return next;
      });
    },
    [activeKey, navigate],
  );

  const onCloseCurrent = useCallback(() => {
    const tab = tabs.find((t) => t.key === activeKey);
    if (tab?.closable) onTabClose(activeKey);
  }, [activeKey, tabs, onTabClose]);

  const onCloseOthers = useCallback(() => {
    setTabs((prev) => prev.filter((t) => !t.closable || t.key === activeKey));
  }, [activeKey]);

  const onCloseAll = useCallback(() => {
    setTabs([HOME_TAB]);
    setActiveKey(HOME_TAB.key);
    navigate(HOME_TAB.key);
  }, [navigate]);

  const onReload = useCallback(() => {
    navigate('/redirect', { replace: true });
    setTimeout(() => navigate(activeKey, { replace: true }), 0);
  }, [activeKey, navigate]);

  return (
    <TabBarContext.Provider
      value={{
        tabs,
        activeKey,
        onTabClick,
        onTabClose,
        onCloseCurrent,
        onCloseOthers,
        onCloseAll,
        onReload,
      }}
    >
      {children}
    </TabBarContext.Provider>
  );
}
