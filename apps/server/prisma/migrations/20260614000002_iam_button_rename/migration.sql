-- ============================================================
-- IAM 「用户」→「管理员」按钮行重命名（补充 migration）
--
-- 背景：
-- 20260614000001_iam_user_to_admin_rename 只改了 parent menu 行（name='用户管理' AND path='user'）
-- 但 admin_menu 表里还有 9 行 button 仍叫「新增/编辑/删除用户」，导致 UI 显示旧名称
--
-- 修复：把所有按钮行 name 同步重命名（where condition 宽松覆盖所有残留）
-- permissionCode 'iam:user:*' 保留（与 parent spec 保持一致，RBAC 改动不在此 scope）
-- ============================================================

UPDATE "admin_menu"
SET "name" = '新增管理员'
WHERE "name" = '新增用户' AND "type" = 'button';

UPDATE "admin_menu"
SET "name" = '编辑管理员'
WHERE "name" = '编辑用户' AND "type" = 'button';

UPDATE "admin_menu"
SET "name" = '删除管理员'
WHERE "name" = '删除用户' AND "type" = 'button';

-- 兜底：覆盖任何残留的 parent menu 行（多次 seed 导致的多个"用户管理"行）
UPDATE "admin_menu"
SET "name" = '管理员管理', "path" = 'admin'
WHERE "name" = '用户管理' AND "type" = 'menu';

UPDATE "admin_menu"
SET "path" = 'admin'
WHERE "path" = 'user' AND "type" = 'menu';

UPDATE "admin_menu"
SET "route_name" = 'IamAdminList'
WHERE "route_name" = 'IamUserList';
