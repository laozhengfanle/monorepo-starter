-- ============================================================
-- 权限码规范化修正
--
-- 背景：
-- 1. 缓存权限码：iam:cache:list / iam:cache:clear → system:cache:list / system:cache:delete
--    后端 cache.controller.ts 使用 system:cache:list / system:cache:delete，数据库中种入的是 iam: 前缀
-- 2. C端权限码：member:*:view → member:*:list
--    命名规范要求操作词用 list 不用 view
-- ============================================================

-- 缓存查看权限：iam:cache:list → system:cache:list
UPDATE "admin_menu"
SET "permission_code" = 'system:cache:list'
WHERE "permission_code" = 'iam:cache:list' AND "type" = 'button';

-- 缓存清除权限：iam:cache:clear → system:cache:delete
UPDATE "admin_menu"
SET "permission_code" = 'system:cache:delete'
WHERE "permission_code" = 'iam:cache:clear' AND "type" = 'button';

-- C端权限码：view → list（统一命名规范）
UPDATE "admin_menu"
SET "permission_code" = 'member:public:list'
WHERE "permission_code" = 'member:public:view';

UPDATE "admin_menu"
SET "permission_code" = 'member:normal:list'
WHERE "permission_code" = 'member:normal:view';

UPDATE "admin_menu"
SET "permission_code" = 'member:vip:list'
WHERE "permission_code" = 'member:vip:view';

UPDATE "admin_menu"
SET "permission_code" = 'member:svip:list'
WHERE "permission_code" = 'member:svip:view';

UPDATE "admin_menu"
SET "permission_code" = 'member:help:list'
WHERE "permission_code" = 'member:help:view';
