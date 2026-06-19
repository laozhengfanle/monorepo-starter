-- DropIndex
DROP INDEX "audit_log_resource_type_idx";

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_idx" ON "audit_log"("resource_type", "resource_id");
