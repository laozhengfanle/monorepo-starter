import type { ReactNode } from 'react';
import { Result } from 'antd';
import { DashboardPage } from '../features/dashboard/pages/dashboard-page';
import { AdminAccountsPage } from '../features/admin-accounts/pages/admin-accounts-page';
import { AdminRolesPage } from '../features/admin-roles/pages/admin-roles-page';
import { AdminMenusPage } from '../features/admin-menus/pages/admin-menus-page';
import { ProfilePage } from '../features/account/profile-page';
import { AccountSettingsPage } from '../features/account/settings-page';
import { SystemSettingsPage } from '../features/system/pages/system-settings-page';
import { AuditLogsPage } from '../features/system/pages/audit-logs-page';
import { StorageDriverPage } from '../features/system/pages/storage-driver-page';
import { CacheAdminPage } from '../features/system/pages/cache-admin-page';
import { TurnstilePage } from '../features/system/pages/turnstile-page';
import { SysDictPage } from '../features/system/pages/sys-dict-page';
import { usePermission } from './auth/use-permission.js';

/**
 * 路由注册表：path → 页面组件（+ 所需权限点）。
 * 侧栏菜单来自后端 me.menus，这里只负责把 path 映射到组件；
 * 新增页面 = 注册一行 + 后端 admin_menu 加一行 menu 记录。
 */
export interface AppRoute {
  path: string;
  element: ReactNode;
  /** 访问该页面所需权限点（缺省不校验） */
  permission?: string;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/', element: <DashboardPage /> },
  { path: '/admin/accounts', element: <AdminAccountsPage />, permission: 'account:list' },
  { path: '/admin/roles', element: <AdminRolesPage />, permission: 'role:list' },
  { path: '/admin/menus', element: <AdminMenusPage />, permission: 'menu:list' },
  { path: '/admin/settings', element: <SystemSettingsPage />, permission: 'config:admin:view' },
  { path: '/admin/audit-logs', element: <AuditLogsPage />, permission: 'config:audit:view' },
  { path: '/admin/storage', element: <StorageDriverPage />, permission: 'config:file:view' },
  { path: '/admin/cache', element: <CacheAdminPage />, permission: 'config:cache:view' },
  { path: '/admin/turnstile', element: <TurnstilePage />, permission: 'config:turnstile:view' },
  { path: '/admin/dicts', element: <SysDictPage />, permission: 'config:dict:view' },
  // 个人中心：登录即可访问，不进菜单表（对标老项目静态路由）
  { path: '/account/profile', element: <ProfilePage /> },
  { path: '/account/settings', element: <AccountSettingsPage /> },
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
