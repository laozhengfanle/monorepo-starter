-- CreateTable
CREATE TABLE "sys_dict_type" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "remark" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_dict_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_dict_item" (
    "id" UUID NOT NULL,
    "dict_type_id" UUID NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "remark" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_dict_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sys_dict_type_code_key" ON "sys_dict_type"("code");

-- CreateIndex
CREATE INDEX "sys_dict_item_dict_type_id_idx" ON "sys_dict_item"("dict_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "sys_dict_item_dict_type_id_value_key" ON "sys_dict_item"("dict_type_id", "value");

-- AddForeignKey
ALTER TABLE "sys_dict_item" ADD CONSTRAINT "sys_dict_item_dict_type_id_fkey" FOREIGN KEY ("dict_type_id") REFERENCES "sys_dict_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;
