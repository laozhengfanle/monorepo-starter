/*
  Warnings:

  - You are about to alter the column `credential` on the `account_identity` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `user_agent` on the `audit_log` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to drop the `sys_config` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "account" ALTER COLUMN "last_login_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "account_identity" ALTER COLUMN "credential" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "verified_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "admin_menu" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "admin_profile" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "admin_role" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "audit_log" ALTER COLUMN "user_agent" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "member_menu" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "member_profile" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "member_role" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "upload_file" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "verification_code" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- DropTable
DROP TABLE "sys_config";

-- CreateTable
CREATE TABLE "system_config" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "remark" VARCHAR(255),
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- CreateIndex
CREATE INDEX "account_user_type_idx" ON "account"("user_type");
