import {
  AppstoreOutlined,
  DashboardOutlined,
  FileOutlined,
  MenuOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Layout, Menu, theme } from 'antd';
import type { MenuProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AdminMenuNode } from '@starter/api-client';
import { useAuth } from '../auth/auth-context.js';
import { SiderTrigger } from './sider-trigger.js';

const { Sider } = Layout;

type MenuItem = NonNullable<MenuProps['items']>[number];

/** 后端菜单图标名 → antd 图标节点（与菜单管理页 ICON_OPTIONS 保持一致） */
const iconMap: Record<string, ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  TeamOutlined: <TeamOutlined />,
  UserOutlined: <UserOutlined />,
  SafetyOutlined: <SafetyOutlined />,
  MenuOutlined: <MenuOutlined />,
  SettingOutlined: <SettingOutlined />,
  FileOutlined: <FileOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
};

function resolveIcon(icon?: string | null): ReactNode {
  return icon ? (iconMap[icon] ?? null) : null;
}

interface BuildResult {
  items: MenuItem[];
  /** 子 key → 父 key（手风琴模式查找父级） */
  parentMap: Map<string, string>;
}

/** 菜单树 → antd Menu items（按钮不进侧栏；目录无 path 用 code 作 key） */
function buildMenuData(nodes: AdminMenuNode[]): BuildResult {
  const parentMap = new Map<string, string>();

  const build = (list: AdminMenuNode[]): MenuItem[] => {
    const result: MenuItem[] = [];
    for (const node of list) {
      if (node.type === 'button') continue;
      const children = (node.children ?? []).filter((c) => c.type !== 'button');
      const key = node.path ?? node.code;
      // 有子菜单（目录）时：记录子级 → 父级关系
      if (children.length > 0) {
        for (const child of children) {
          parentMap.set(child.path ?? child.code, key);
        }
      }
      result.push({
        key,
        icon: resolveIcon(node.icon),
        label: node.name,
        ...(children.length > 0 ? { children: build(children) } : {}),
      });
    }
    return result;
  };

  return { items: build(nodes), parentMap };
}

interface LayoutSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Sider breakpoint 回调：broken=true 表示视口 < lg */
  onBreakpoint?: (broken: boolean) => void;
}

/** 侧栏：me.menus 菜单 + 手风琴 + 响应式折叠 + 悬浮折叠按钮 */
export function LayoutSidebar({
  collapsed,
  onToggle,
  onBreakpoint,
}: LayoutSidebarProps): React.JSX.Element {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const menus = useMemo(() => user?.menus ?? [], [user?.menus]);
  const selectedKey = location.pathname;
  // parentMap 必须 memo：Menu 的 openKeys 受控，parentMap 每次 render 重建会触发无限 setState
  const { items: menuItems, parentMap } = useMemo(() => buildMenuData(menus), [menus]);

  // 手风琴：openKeys 只保留一个父级
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const parent = parentMap.get(selectedKey);
    return parent ? [parent] : [];
  });

  useEffect(() => {
    const parent = parentMap.get(selectedKey);
    setOpenKeys((prev) => {
      if (!parent) {
        return prev.length === 0 ? prev : [];
      }
      return prev[0] === parent ? prev : [parent];
    });
  }, [selectedKey, parentMap]);

  const allItems: MenuItem[] = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    ...menuItems,
  ];

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onToggle}
      trigger={null}
      width={220}
      breakpoint="lg"
      collapsedWidth={0}
      onBreakpoint={onBreakpoint}
      className="h-full border-r relative"
      style={{
        background: token.colorBgContainer,
        borderColor: token.colorBorderSecondary,
      }}
    >
      <div className="h-full overflow-auto">
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={(keys) => {
            const added = keys.find((k) => !openKeys.includes(k));
            setOpenKeys(added ? [added] : keys);
          }}
          items={allItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </div>

      {/* 折叠按钮：自绘双箭头，悬浮在侧栏右边缘 */}
      <SiderTrigger collapsed={collapsed} onToggle={onToggle} />
    </Sider>
  );
}
