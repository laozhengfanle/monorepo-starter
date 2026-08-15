-- CreateTable
CREATE TABLE "admin_account_menu" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "type" VARCHAR(10) NOT NULL DEFAULT 'grant',

    CONSTRAINT "admin_account_menu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_account_menu_account_id_menu_id_key" ON "admin_account_menu"("account_id", "menu_id");

-- AddForeignKey
ALTER TABLE "admin_account_menu" ADD CONSTRAINT "admin_account_menu_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_account_menu" ADD CONSTRAINT "admin_account_menu_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "admin_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
