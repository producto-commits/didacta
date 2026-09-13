-- CreateTable
CREATE TABLE "mod_reto_action_done" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "action_key" VARCHAR(64) NOT NULL,
    "done_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mod_reto_action_done_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mod_reto_action_done_tenant_id_user_id_lesson_id_action_key_key" ON "mod_reto_action_done"("tenant_id", "user_id", "lesson_id", "action_key");

-- CreateIndex
CREATE INDEX "mod_reto_action_done_tenant_id_user_id_lesson_id_idx" ON "mod_reto_action_done"("tenant_id", "user_id", "lesson_id");
