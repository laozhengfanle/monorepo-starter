-- account 表 user_type CHECK 约束：defense-in-depth
-- 只允许 'admin' 和 'member' 两种用户类型，数据库层拒绝非法值
ALTER TABLE "account" ADD CONSTRAINT "account_user_type_check"
  CHECK (user_type IN ('admin', 'member'));
