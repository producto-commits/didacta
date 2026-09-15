-- Asistente de retos (Fase F): historial de entregas y conversaciones con Dana.

-- Una fila por captura enviada, aprobada o rechazada ("Retos enviados").
CREATE TABLE "mod_retos_submission" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reto_id" UUID NOT NULL,
    "action_key" VARCHAR(64) NOT NULL,
    "verdict" VARCHAR(16) NOT NULL,
    "feedback" VARCHAR(4000) NOT NULL,
    "canal" VARCHAR(64),
    "storage_key" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mod_retos_submission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mod_retos_submission_tenant_id_user_id_created_at_idx" ON "mod_retos_submission"("tenant_id", "user_id", "created_at" DESC);

-- Conversación de Dana (conversacionId que se manda a n8n).
ALTER TABLE "mod_dana_message" ADD COLUMN "conversation_id" UUID;

CREATE INDEX "mod_dana_message_tenant_id_conversation_id_idx" ON "mod_dana_message"("tenant_id", "conversation_id");
