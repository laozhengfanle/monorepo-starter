-- ============================================================
-- 1) 清空二级菜单的 icon（只保留顶级目录菜单的 icon）
-- ============================================================
UPDATE admin_menu
SET icon = ''
WHERE type = 'menu'
  AND parent_id IS NOT NULL;

-- ============================================================
-- 2) 给"系统设置"下子菜单补按钮权限（type='button'）
--    之前只有"基础配置"下有"更新配置"按钮，其他子菜单（审计日志/短信/邮件/存储/OAuth/Turnstile/缓存）只有父菜单，缺操作权限粒度
-- ============================================================

-- 审计日志：补"导出审计日志"按钮
INSERT INTO admin_menu (
    id, parent_id, name, type, permission_code, icon, sort, visible, enabled, keep_alive, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    m.id,
    '导出审计日志',
    'button',
    'iam:audit:export',
    '',
    1,
    true,
    true,
    true,
    NOW(),
    NOW()
FROM admin_menu m
WHERE m.name = '审计日志' AND m.type = 'menu'
  AND NOT EXISTS (
      SELECT 1 FROM admin_menu c
      WHERE c.parent_id = m.id AND c.permission_code = 'iam:audit:export'
  );

-- 短信服务：补"查看列表"+"发送短信"+"编辑配置"按钮
INSERT INTO admin_menu (id, parent_id, name, type, permission_code, icon, sort, visible, enabled, keep_alive, created_at, updated_at)
SELECT gen_random_uuid(), m.id, x.name, 'button', x.perm, '', x.sort, true, true, true, NOW(), NOW()
FROM admin_menu m
CROSS JOIN (VALUES
    ('查看短信', 'iam:sms:list', 1),
    ('发送短信', 'iam:sms:send', 2),
    ('编辑配置', 'iam:sms:update', 3)
) AS x(name, perm, sort)
WHERE m.name = '短信服务' AND m.type = 'menu'
  AND NOT EXISTS (
      SELECT 1 FROM admin_menu c WHERE c.parent_id = m.id AND c.permission_code = x.perm
  );

-- 邮件服务：补"查看列表"+"发送邮件"+"编辑配置"按钮
INSERT INTO admin_menu (id, parent_id, name, type, permission_code, icon, sort, visible, enabled, keep_alive, created_at, updated_at)
SELECT gen_random_uuid(), m.id, x.name, 'button', x.perm, '', x.sort, true, true, true, NOW(), NOW()
FROM admin_menu m
CROSS JOIN (VALUES
    ('查看邮件', 'iam:mail:list', 1),
    ('发送邮件', 'iam:mail:send', 2),
    ('编辑配置', 'iam:mail:update', 3)
) AS x(name, perm, sort)
WHERE m.name = '邮件服务' AND m.type = 'menu'
  AND NOT EXISTS (
      SELECT 1 FROM admin_menu c WHERE c.parent_id = m.id AND c.permission_code = x.perm
  );

-- 文件存储：补"查看列表"+"上传文件"+"删除文件"按钮
INSERT INTO admin_menu (id, parent_id, name, type, permission_code, icon, sort, visible, enabled, keep_alive, created_at, updated_at)
SELECT gen_random_uuid(), m.id, x.name, 'button', x.perm, '', x.sort, true, true, true, NOW(), NOW()
FROM admin_menu m
CROSS JOIN (VALUES
    ('查看文件', 'iam:file:list', 1),
    ('上传文件', 'iam:file:upload', 2),
    ('删除文件', 'iam:file:delete', 3)
) AS x(name, perm, sort)
WHERE m.name = '文件存储' AND m.type = 'menu'
  AND NOT EXISTS (
      SELECT 1 FROM admin_menu c WHERE c.parent_id = m.id AND c.permission_code = x.perm
  );

-- OAuth 配置：补"查看配置"+"编辑配置"按钮
INSERT INTO admin_menu (id, parent_id, name, type, permission_code, icon, sort, visible, enabled, keep_alive, created_at, updated_at)
SELECT gen_random_uuid(), m.id, x.name, 'button', x.perm, '', x.sort, true, true, true, NOW(), NOW()
FROM admin_menu m
CROSS JOIN (VALUES
    ('查看配置', 'iam:oauth:list', 1),
    ('编辑配置', 'iam:oauth:update', 2)
) AS x(name, perm, sort)
WHERE m.name = 'OAuth 配置' AND m.type = 'menu'
  AND NOT EXISTS (
      SELECT 1 FROM admin_menu c WHERE c.parent_id = m.id AND c.permission_code = x.perm
  );

-- Turnstile：补"查看配置"+"编辑配置"按钮
INSERT INTO admin_menu (id, parent_id, name, type, permission_code, icon, sort, visible, enabled, keep_alive, created_at, updated_at)
SELECT gen_random_uuid(), m.id, x.name, 'button', x.perm, '', x.sort, true, true, true, NOW(), NOW()
FROM admin_menu m
CROSS JOIN (VALUES
    ('查看配置', 'iam:turnstile:list', 1),
    ('编辑配置', 'iam:turnstile:update', 2)
) AS x(name, perm, sort)
WHERE m.name = 'Turnstile' AND m.type = 'menu'
  AND NOT EXISTS (
      SELECT 1 FROM admin_menu c WHERE c.parent_id = m.id AND c.permission_code = x.perm
  );

-- 缓存管理：补"查看缓存"+"清理缓存"按钮
INSERT INTO admin_menu (id, parent_id, name, type, permission_code, icon, sort, visible, enabled, keep_alive, created_at, updated_at)
SELECT gen_random_uuid(), m.id, x.name, 'button', x.perm, '', x.sort, true, true, true, NOW(), NOW()
FROM admin_menu m
CROSS JOIN (VALUES
    ('查看缓存', 'iam:cache:list', 1),
    ('清理缓存', 'iam:cache:clear', 2)
) AS x(name, perm, sort)
WHERE m.name = '缓存管理' AND m.type = 'menu'
  AND NOT EXISTS (
      SELECT 1 FROM admin_menu c WHERE c.parent_id = m.id AND c.permission_code = x.perm
  );

-- ============================================================
-- 3) 把 super_admin 角色的菜单关联补齐：所有新加的按钮都自动分给 super_admin
--    之前是按 menu id 列表 createMany，新加的按钮不在那个快照里
-- ============================================================
INSERT INTO admin_role_menu (id, role_id, menu_id)
SELECT gen_random_uuid(), r.id, m.id
FROM admin_role r
CROSS JOIN admin_menu m
WHERE r.code = 'super_admin'
  AND m.type = 'button'
  AND m.permission_code IN (
      'iam:audit:export', 'iam:sms:list', 'iam:sms:send', 'iam:sms:update',
      'iam:mail:list', 'iam:mail:send', 'iam:mail:update',
      'iam:file:list', 'iam:file:upload', 'iam:file:delete',
      'iam:oauth:list', 'iam:oauth:update',
      'iam:turnstile:list', 'iam:turnstile:update',
      'iam:cache:list', 'iam:cache:clear'
  )
  AND NOT EXISTS (
      SELECT 1 FROM admin_role_menu arm WHERE arm.role_id = r.id AND arm.menu_id = m.id
  );
