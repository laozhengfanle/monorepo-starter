-- ============================================================
-- IAM 「用户管理」→「管理员管理」重命名
--
-- 把 admin_menu 表中"用户管理"行的 name/path/route_name 改成业务上正确的值
-- （与同名 spec .trae/specs/iam-user-to-admin-rename 配套）
--
-- 业务对象是"管理员"（DB 表 admin_account），菜单却叫"用户"造成术语混乱。
-- 组件 iam/admins 路径不变，permissionCode 'iam:user:list' 也保留
-- （避免破坏 RBAC 历史绑定 —— RBAC 改动是另一个 spec 的范围）。
--
-- 不改 audit_log 历史记录（保留业务准确性）。
-- ============================================================

UPDATE "admin_menu"
SET "name" = '管理员管理', "path" = 'admin'
WHERE "name" = '用户管理' AND "path" = 'user';

UPDATE "admin_menu"
SET "route_name" = 'IamAdminList'
WHERE "route_name" = 'IamUserList';
