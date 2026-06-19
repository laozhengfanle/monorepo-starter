-- ============================================================
-- 菜单重命名：系统设置 → 配置中心
-- 路由前缀：/system → /config
-- 权限码：system:* → config:*
--
-- 变更范围：
-- 1. 一级目录：改名 + 改 path + 改 icon
-- 2. 子菜单：改 routeName、component、permissionCode
--    - "后台设置" path: settings → admin，权限码 system:config:* → config:admin:*
-- 3. 按钮：改 permissionCode
-- ============================================================

-- ── 1. 一级目录：系统设置 → 配置中心 ──
UPDATE "admin_menu"
SET "name" = '配置中心', "path" = '/config'
WHERE "name" = '系统设置' AND "type" = 'directory';

-- ── 2. 后台设置 → path 改为 admin，routeName 改为 ConfigAdmin，component 改为 config/admin ──
UPDATE "admin_menu"
SET "path" = 'admin',
    "route_name" = 'ConfigAdmin',
    "component" = 'config/admin'
WHERE "name" = '后台设置' AND "type" = 'menu';

-- ── 3. 后台设置下按钮：system:config:* → config:admin:* ──
UPDATE "admin_menu"
SET "permission_code" = 'config:admin:create'
WHERE "permission_code" = 'system:config:create';

UPDATE "admin_menu"
SET "permission_code" = 'config:admin:update'
WHERE "permission_code" = 'system:config:update';

UPDATE "admin_menu"
SET "permission_code" = 'config:admin:delete'
WHERE "permission_code" = 'system:config:delete';

-- ── 4. 后台设置菜单级权限码 ──
UPDATE "admin_menu"
SET "permission_code" = 'config:admin:view'
WHERE "permission_code" = 'system:config:view';

-- ── 5. 审计日志：routeName + component + permissionCode ──
UPDATE "admin_menu"
SET "route_name" = 'ConfigLogs',
    "component" = 'config/logs'
WHERE "name" = '审计日志' AND "type" = 'menu';

UPDATE "admin_menu"
SET "permission_code" = 'config:audit:view'
WHERE "permission_code" = 'system:audit:view';

UPDATE "admin_menu"
SET "permission_code" = 'config:audit:clear'
WHERE "permission_code" = 'system:audit:clear';

UPDATE "admin_menu"
SET "permission_code" = 'config:audit:export'
WHERE "permission_code" = 'system:audit:export';

UPDATE "admin_menu"
SET "permission_code" = 'config:audit:delete'
WHERE "permission_code" = 'system:audit:delete';

-- ── 6. 短信服务：routeName + component + permissionCode ──
UPDATE "admin_menu"
SET "route_name" = 'ConfigSmsProvider',
    "component" = 'config/sms-provider'
WHERE "name" = '短信服务' AND "type" = 'menu';

UPDATE "admin_menu"
SET "permission_code" = 'config:sms:view'
WHERE "permission_code" = 'system:sms:view';

UPDATE "admin_menu"
SET "permission_code" = 'config:sms:send'
WHERE "permission_code" = 'system:sms:send';

UPDATE "admin_menu"
SET "permission_code" = 'config:sms:update'
WHERE "permission_code" = 'system:sms:update';

-- ── 7. 邮件服务：routeName + component + permissionCode ──
UPDATE "admin_menu"
SET "route_name" = 'ConfigMailService',
    "component" = 'config/mail-service'
WHERE "name" = '邮件服务' AND "type" = 'menu';

UPDATE "admin_menu"
SET "permission_code" = 'config:mail:view'
WHERE "permission_code" = 'system:mail:view';

UPDATE "admin_menu"
SET "permission_code" = 'config:mail:send'
WHERE "permission_code" = 'system:mail:send';

UPDATE "admin_menu"
SET "permission_code" = 'config:mail:update'
WHERE "permission_code" = 'system:mail:update';

-- ── 8. 文件存储：routeName + component + permissionCode ──
UPDATE "admin_menu"
SET "route_name" = 'ConfigStorageDriver',
    "component" = 'config/storage-driver'
WHERE "name" = '文件存储' AND "type" = 'menu';

UPDATE "admin_menu"
SET "permission_code" = 'config:file:view'
WHERE "permission_code" = 'system:file:view';

UPDATE "admin_menu"
SET "permission_code" = 'config:file:upload'
WHERE "permission_code" = 'system:file:upload';

UPDATE "admin_menu"
SET "permission_code" = 'config:file:delete'
WHERE "permission_code" = 'system:file:delete';

UPDATE "admin_menu"
SET "permission_code" = 'config:file:create'
WHERE "permission_code" = 'system:file:create';

UPDATE "admin_menu"
SET "permission_code" = 'config:file:hard_delete'
WHERE "permission_code" = 'system:file:hard_delete';

UPDATE "admin_menu"
SET "permission_code" = 'config:file:restore'
WHERE "permission_code" = 'system:file:restore';

-- ── 9. 缓存管理：routeName + component + permissionCode ──
UPDATE "admin_menu"
SET "route_name" = 'ConfigCache',
    "component" = 'config/cache'
WHERE "name" = '缓存管理' AND "type" = 'menu';

UPDATE "admin_menu"
SET "permission_code" = 'config:cache:view'
WHERE "permission_code" = 'system:cache:view';

UPDATE "admin_menu"
SET "permission_code" = 'config:cache:delete'
WHERE "permission_code" = 'system:cache:delete';

-- ── 10. OAuth 配置：routeName + component + permissionCode ──
UPDATE "admin_menu"
SET "route_name" = 'ConfigOauth',
    "component" = 'config/oauth'
WHERE "name" = 'OAuth 配置' AND "type" = 'menu';

UPDATE "admin_menu"
SET "permission_code" = 'config:oauth:view'
WHERE "permission_code" = 'system:oauth:view';

UPDATE "admin_menu"
SET "permission_code" = 'config:oauth:update'
WHERE "permission_code" = 'system:oauth:update';

-- ── 11. Turnstile：routeName + component + permissionCode ──
UPDATE "admin_menu"
SET "route_name" = 'ConfigTurnstile',
    "component" = 'config/turnstile'
WHERE "name" = 'Turnstile' AND "type" = 'menu';

UPDATE "admin_menu"
SET "permission_code" = 'config:turnstile:view'
WHERE "permission_code" = 'system:turnstile:view';

UPDATE "admin_menu"
SET "permission_code" = 'config:turnstile:update'
WHERE "permission_code" = 'system:turnstile:update';

-- ── 12. 兜底：所有遗漏的 system:* 权限码统一替换前缀 ──
-- 此 UPDATE 仅在前面未覆盖的记录上生效（system: 开头的且尚未改为 config: 的）
UPDATE "admin_menu"
SET "permission_code" = 'config:' || substring("permission_code" from 8)
WHERE "permission_code" LIKE 'system:%';
