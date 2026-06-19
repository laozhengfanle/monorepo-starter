-- ============================================================
-- IAM 权限码 iam:user:* → iam:admin:* 重命名
--
-- 续上一个 migration (20260614000001_iam_user_to_admin_rename)：
-- 上次只改了菜单的 name/path/route_name，把 permissionCode 留作另一个 spec。
-- 本次做这个 RBAC 改动，把 iam:user:* 统一改成 iam:admin:*。
--
-- 原因：
-- - 业务对象是「管理员」（DB 表 admin_account），不是「用户」
-- - iam:user:* 与 iam:role:* / iam:menu:* 命名风格不一致（user 是「角色类型」而不是「模块」）
-- - 之前 seed 用错了 user，代码各处散落 iam:user:*，现在统一收口
--
-- 不改 audit_log 历史记录（保留业务准确性）。
-- ============================================================

UPDATE "admin_menu"
SET "permission_code" = 'iam:admin:list'
WHERE "permission_code" = 'iam:user:list';

UPDATE "admin_menu"
SET "permission_code" = 'iam:admin:create'
WHERE "permission_code" = 'iam:user:create';

UPDATE "admin_menu"
SET "permission_code" = 'iam:admin:update'
WHERE "permission_code" = 'iam:user:update';

UPDATE "admin_menu"
SET "permission_code" = 'iam:admin:delete'
WHERE "permission_code" = 'iam:user:delete';

UPDATE "admin_menu"
SET "permission_code" = 'iam:admin:reset_password'
WHERE "permission_code" = 'iam:user:reset_password';
