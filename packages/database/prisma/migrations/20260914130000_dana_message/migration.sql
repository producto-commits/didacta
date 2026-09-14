-- Dana (agente n8n): mensajes del chat del asistente de retos.
CREATE TABLE "mod_dana_message" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "direction" VARCHAR(8) NOT NULL,
    "text" VARCHAR(4000) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'SENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mod_dana_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mod_dana_message_tenant_id_user_id_created_at_idx" ON "mod_dana_message"("tenant_id", "user_id", "created_at" DESC);
