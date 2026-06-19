-- Drop deleted_at columns from menu tables (menus no longer use soft delete)
ALTER TABLE "admin_menu" DROP COLUMN "deleted_at";
ALTER TABLE "member_menu" DROP COLUMN "deleted_at";
