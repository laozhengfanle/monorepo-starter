-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "user_type" VARCHAR(10) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_login_ip" VARCHAR(50),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

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
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admin_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_profile" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "phone" VARCHAR(20),
    "nickname" VARCHAR(50) NOT NULL DEFAULT '',
    "avatar" VARCHAR(255) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "member_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admin_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_menu" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "path" VARCHAR(255) NOT NULL DEFAULT '',
    "route_name" VARCHAR(100) NOT NULL DEFAULT '',
    "icon" VARCHAR(100) NOT NULL DEFAULT '',
    "permission_code" VARCHAR(100) NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "keep_alive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admin_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_account_role" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "admin_account_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_menu" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,

    CONSTRAINT "admin_role_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_account_menu" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "type" VARCHAR(10) NOT NULL DEFAULT 'grant',

    CONSTRAINT "admin_account_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_role" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "member_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_menu" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "path" VARCHAR(255) NOT NULL DEFAULT '',
    "route_name" VARCHAR(100) NOT NULL DEFAULT '',
    "icon" VARCHAR(100) NOT NULL DEFAULT '',
    "permission_code" VARCHAR(100) NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "keep_alive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "member_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_account_role" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "member_account_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_role_menu" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,

    CONSTRAINT "member_role_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_account_menu" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "type" VARCHAR(10) NOT NULL DEFAULT 'grant',

    CONSTRAINT "member_account_menu_pkey" PRIMARY KEY ("id")
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
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_file" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" BIGINT NOT NULL,
    "storage" VARCHAR(20) NOT NULL DEFAULT 'local',
    "folder" VARCHAR(100) NOT NULL DEFAULT 'files',
    "url" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "upload_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_code" (
    "id" UUID NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "ip" VARCHAR(50),
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_config" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "remark" VARCHAR(255),
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_identity_identity_type_identifier_key" ON "account_identity"("identity_type", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profile_account_id_key" ON "admin_profile"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_profile_account_id_key" ON "member_profile"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_role_code_key" ON "admin_role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "admin_account_role_account_id_role_id_key" ON "admin_account_role"("account_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_role_menu_role_id_menu_id_key" ON "admin_role_menu"("role_id", "menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_account_menu_account_id_menu_id_key" ON "admin_account_menu"("account_id", "menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_role_code_key" ON "member_role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "member_account_role_account_id_role_id_key" ON "member_account_role"("account_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_role_menu_role_id_menu_id_key" ON "member_role_menu"("role_id", "menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_account_menu_account_id_menu_id_key" ON "member_account_menu"("account_id", "menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "sys_config_key_key" ON "sys_config"("key");

-- AddForeignKey
ALTER TABLE "account_identity" ADD CONSTRAINT "account_identity_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profile" ADD CONSTRAINT "admin_profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profile" ADD CONSTRAINT "member_profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_account_role" ADD CONSTRAINT "admin_account_role_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_account_role" ADD CONSTRAINT "admin_account_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_menu" ADD CONSTRAINT "admin_role_menu_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_menu" ADD CONSTRAINT "admin_role_menu_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "admin_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_account_menu" ADD CONSTRAINT "admin_account_menu_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_account_menu" ADD CONSTRAINT "admin_account_menu_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "admin_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_account_role" ADD CONSTRAINT "member_account_role_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_account_role" ADD CONSTRAINT "member_account_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "member_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_role_menu" ADD CONSTRAINT "member_role_menu_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "member_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_role_menu" ADD CONSTRAINT "member_role_menu_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "member_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_account_menu" ADD CONSTRAINT "member_account_menu_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_account_menu" ADD CONSTRAINT "member_account_menu_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "member_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_file" ADD CONSTRAINT "upload_file_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
