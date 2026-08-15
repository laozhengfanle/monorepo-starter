-- CreateTable
CREATE TABLE "admin_menu" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "admin_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_menu" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,

    CONSTRAINT "admin_role_menu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_menu_code_key" ON "admin_menu"("code");

-- CreateIndex
CREATE INDEX "admin_menu_parent_id_idx" ON "admin_menu"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_role_menu_role_id_menu_id_key" ON "admin_role_menu"("role_id", "menu_id");

-- AddForeignKey
ALTER TABLE "admin_role_menu" ADD CONSTRAINT "admin_role_menu_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_menu" ADD CONSTRAINT "admin_role_menu_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "admin_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
