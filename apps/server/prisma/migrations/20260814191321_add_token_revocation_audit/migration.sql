-- CreateTable
CREATE TABLE "token_revocation" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "jti" VARCHAR(128) NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_revocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "account_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "resource_type" VARCHAR(50),
    "resource_id" UUID,
    "detail" JSONB,
    "ip" VARCHAR(50),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_revocation_jti_idx" ON "token_revocation"("jti");

-- CreateIndex
CREATE INDEX "token_revocation_account_id_idx" ON "token_revocation"("account_id");

-- CreateIndex
CREATE INDEX "token_revocation_expires_at_idx" ON "token_revocation"("expires_at");

-- CreateIndex
CREATE INDEX "audit_log_account_id_idx" ON "audit_log"("account_id");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_idx" ON "audit_log"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "token_revocation" ADD CONSTRAINT "token_revocation_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
