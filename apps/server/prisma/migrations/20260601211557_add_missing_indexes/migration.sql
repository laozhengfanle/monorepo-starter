-- CreateIndex
CREATE INDEX "account_identity_account_id_idx" ON "account_identity"("account_id");

-- CreateIndex
CREATE INDEX "admin_menu_parent_id_idx" ON "admin_menu"("parent_id");

-- CreateIndex
CREATE INDEX "audit_log_account_id_idx" ON "audit_log"("account_id");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_idx" ON "audit_log"("resource_type");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "member_menu_parent_id_idx" ON "member_menu"("parent_id");

-- CreateIndex
CREATE INDEX "upload_file_account_id_idx" ON "upload_file"("account_id");

-- CreateIndex
CREATE INDEX "upload_file_created_at_idx" ON "upload_file"("created_at");

-- CreateIndex
CREATE INDEX "upload_file_mime_type_idx" ON "upload_file"("mime_type");

-- CreateIndex
CREATE INDEX "upload_file_deleted_at_idx" ON "upload_file"("deleted_at");

-- CreateIndex
CREATE INDEX "verification_code_identifier_idx" ON "verification_code"("identifier");
