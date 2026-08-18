import { lazy } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Result } from 'antd';
import { usePermission } from './auth/use-permission.js';

/**
 * 路由注册表：path → 页面组件（+ 所需权限点）。
 * 页面组件统一 React.lazy 按需加载：初始包只含 shell + 登录，
 * 重页面（echarts / tiptap）各自拆到独立 chunk，降低首屏体积。
 * 侧栏菜单来自后端 me.menus，这里只负责把 path 映射到组件；
 * 新增页面 = 注册一行 + 后端 admin_menu 加一行 menu 记录。
 */

// 页面均为 named export，React.lazy 只接受 default，这里做一次映射
const DashboardPage = lazy(() =>
  import('../features/dashboard/pages/dashboard-page').then((m) => ({
    default: m.DashboardPage,
  })),
);
const AdminAccountsPage = lazy(() =>
  import('../features/admin-accounts/pages/admin-accounts-page').then((m) => ({
    default: m.AdminAccountsPage,
  })),
);
const AdminRolesPage = lazy(() =>
  import('../features/admin-roles/pages/admin-roles-page').then((m) => ({
    default: m.AdminRolesPage,
  })),
);
const AdminMenusPage = lazy(() =>
  import('../features/admin-menus/pages/admin-menus-page').then((m) => ({
    default: m.AdminMenusPage,
  })),
);
const ProfilePage = lazy(() =>
  import('../features/account/profile-page').then((m) => ({
    default: m.ProfilePage,
  })),
);
const AccountSettingsPage = lazy(() =>
  import('../features/account/settings-page').then((m) => ({
    default: m.AccountSettingsPage,
  })),
);
const SystemSettingsPage = lazy(() =>
  import('../features/system/pages/system-settings-page').then((m) => ({
    default: m.SystemSettingsPage,
  })),
);
const AuditLogsPage = lazy(() =>
  import('../features/system/pages/audit-logs-page').then((m) => ({
    default: m.AuditLogsPage,
  })),
);
const StorageDriverPage = lazy(() =>
  import('../features/system/pages/storage-driver-page').then((m) => ({
    default: m.StorageDriverPage,
  })),
);
const CacheAdminPage = lazy(() =>
  import('../features/system/pages/cache-admin-page').then((m) => ({
    default: m.CacheAdminPage,
  })),
);
const TurnstilePage = lazy(() =>
  import('../features/system/pages/turnstile-page').then((m) => ({
    default: m.TurnstilePage,
  })),
);
const SysDictPage = lazy(() =>
  import('../features/system/pages/sys-dict-page').then((m) => ({
    default: m.SysDictPage,
  })),
);

export interface AppRoute {
  path: string;
  component: ComponentType;
  /** 访问该页面所需权限点（缺省不校验） */
  permission?: string;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/', component: DashboardPage },
  {
    path: '/admin/accounts',
    component: AdminAccountsPage,
    permission: 'account:list',
  },
  { path: '/admin/roles', component: AdminRolesPage, permission: 'role:list' },
  { path: '/admin/menus', component: AdminMenusPage, permission: 'menu:list' },
  {
    path: '/admin/settings',
    component: SystemSettingsPage,
    permission: 'config:admin:view',
  },
  {
    path: '/admin/audit-logs',
    component: AuditLogsPage,
    permission: 'config:audit:view',
  },
  {
    path: '/admin/storage',
    component: StorageDriverPage,
    permission: 'config:file:view',
  },
  {
    path: '/admin/cache',
    component: CacheAdminPage,
    permission: 'config:cache:view',
  },
  {
    path: '/admin/turnstile',
    component: TurnstilePage,
    permission: 'config:turnstile:view',
  },
  {
    path: '/admin/dicts',
    component: SysDictPage,
    permission: 'config:dict:view',
  },
  // 个人中心：登录即可访问，不进菜单表（对标老项目静态路由）
  { path: '/account/profile', component: ProfilePage },
  { path: '/account/settings', component: AccountSettingsPage },
];

/** 路由守卫：无权限时渲染 403（菜单已按权限隐藏，直达 URL 时兜底） */
export function RouteGuard({
  permission,
  children,
}: {
  permission?: string;
  children: ReactNode;
}): React.JSX.Element {
  const allowed = usePermission(permission);
  if (!allowed) {
    return (
      <Result status="403" title="403" subTitle="抱歉，你没有权限访问该页面" />
    );
  }
  return <>{children}</>;
}
