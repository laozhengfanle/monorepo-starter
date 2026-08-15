-- CreateTable
CREATE TABLE "upload_file" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" BIGINT NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "upload_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_file_account_id_idx" ON "upload_file"("account_id");

-- CreateIndex
CREATE INDEX "upload_file_created_at_idx" ON "upload_file"("created_at");

-- AddForeignKey
ALTER TABLE "upload_file" ADD CONSTRAINT "upload_file_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
