/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `admin_role` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `member_role` table. All the data in the column will be lost.
  - You are about to drop the column `used` on the `verification_code` table. All the data in the column will be lost.
  - You are about to alter the column `identifier` on the `verification_code` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(100)`.

*/
-- DropForeignKey
ALTER TABLE "token_revocation" DROP CONSTRAINT "token_revocation_account_id_fkey";

-- AlterTable
ALTER TABLE "account_identity" ALTER COLUMN "credential" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "admin_role" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "member_role" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "verification_code" DROP COLUMN "used",
ADD COLUMN     "channel" VARCHAR(20) NOT NULL DEFAULT 'sms',
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'sent',
ADD COLUMN     "verified_at" TIMESTAMPTZ,
ALTER COLUMN "identifier" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "code" SET DEFAULT '******',
ALTER COLUMN "purpose" SET DATA TYPE VARCHAR(50);

-- CreateIndex
CREATE INDEX "admin_menu_active_menu_id_idx" ON "admin_menu"("active_menu_id");

-- CreateIndex
CREATE INDEX "verification_code_purpose_idx" ON "verification_code"("purpose");

-- CreateIndex
CREATE INDEX "verification_code_created_at_idx" ON "verification_code"("created_at");

-- CreateIndex
CREATE INDEX "verification_code_ip_idx" ON "verification_code"("ip");

-- CreateIndex
CREATE INDEX "verification_code_status_idx" ON "verification_code"("status");

-- AddForeignKey
ALTER TABLE "token_revocation" ADD CONSTRAINT "token_revocation_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
