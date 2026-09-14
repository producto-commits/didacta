-- Retos (Dropi Academy): reto administrable + acciones del catálogo +
-- acciones hechas por alumno + completitud premiada. Ver docs/retos/plan-retos.md.

-- CreateTable
CREATE TABLE "mod_retos_reto" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "module_key" VARCHAR(64) NOT NULL DEFAULT 'bienvenido',
    "position" INTEGER NOT NULL,
    "lesson_id" UUID,
    "quiz_id" UUID,
    "points" INTEGER NOT NULL DEFAULT 0,
    "badge_key" VARCHAR(64),
    "badge_label" VARCHAR(120),
    "badge_emoji" VARCHAR(16),
    "completion_message" VARCHAR(1000),
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mod_retos_reto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mod_retos_action" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reto_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mod_retos_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mod_retos_action_done" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reto_id" UUID NOT NULL,
    "action_key" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "meta" JSONB,
    "done_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mod_retos_action_done_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mod_retos_completion" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reto_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "awarded_at" TIMESTAMP(3),
    "source_key" VARCHAR(160) NOT NULL,

    CONSTRAINT "mod_retos_completion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mod_retos_reto_tenant_id_key_key" ON "mod_retos_reto"("tenant_id", "key");
CREATE INDEX "mod_retos_reto_tenant_id_module_key_position_idx" ON "mod_retos_reto"("tenant_id", "module_key", "position");
CREATE INDEX "mod_retos_reto_tenant_id_lesson_id_idx" ON "mod_retos_reto"("tenant_id", "lesson_id");

CREATE UNIQUE INDEX "mod_retos_action_reto_id_key_key" ON "mod_retos_action"("reto_id", "key");
CREATE INDEX "mod_retos_action_tenant_id_reto_id_position_idx" ON "mod_retos_action"("tenant_id", "reto_id", "position");

CREATE UNIQUE INDEX "mod_retos_action_done_tenant_id_user_id_reto_id_action_key_key" ON "mod_retos_action_done"("tenant_id", "user_id", "reto_id", "action_key");
CREATE INDEX "mod_retos_action_done_tenant_id_user_id_reto_id_idx" ON "mod_retos_action_done"("tenant_id", "user_id", "reto_id");

CREATE UNIQUE INDEX "mod_retos_completion_tenant_id_user_id_reto_id_key" ON "mod_retos_completion"("tenant_id", "user_id", "reto_id");
CREATE INDEX "mod_retos_completion_tenant_id_user_id_completed_at_idx" ON "mod_retos_completion"("tenant_id", "user_id", "completed_at" DESC);

-- AddForeignKey
ALTER TABLE "mod_retos_action" ADD CONSTRAINT "mod_retos_action_reto_id_fkey" FOREIGN KEY ("reto_id") REFERENCES "mod_retos_reto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
