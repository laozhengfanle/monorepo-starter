-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "user_type" VARCHAR(10) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_identity" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "identity_type" VARCHAR(20) NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "credential" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_profile" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "nickname" VARCHAR(50) NOT NULL DEFAULT '',
    "phone" VARCHAR(20) NOT NULL DEFAULT '',
    "email" VARCHAR(100) NOT NULL DEFAULT '',
    "avatar" VARCHAR(255) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "admin_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "admin_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_account_role" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "admin_account_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_user_type_idx" ON "account"("user_type");

-- CreateIndex
CREATE INDEX "account_identity_account_id_idx" ON "account_identity"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_identity_identity_type_identifier_key" ON "account_identity"("identity_type", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profile_account_id_key" ON "admin_profile"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_role_code_key" ON "admin_role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "admin_account_role_account_id_role_id_key" ON "admin_account_role"("account_id", "role_id");

-- AddForeignKey
ALTER TABLE "account_identity" ADD CONSTRAINT "account_identity_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profile" ADD CONSTRAINT "admin_profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_account_role" ADD CONSTRAINT "admin_account_role_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_account_role" ADD CONSTRAINT "admin_account_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
