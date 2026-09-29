-- Perfilamiento de usuario (diagnóstico inicial). Se captura en /perfilamiento
-- tras el onboarding, una sola vez. Columnas nullable → sin backfill; el gate
-- por `perfil_completado_at IS NULL` también alcanza a inactivos existentes en
-- su próximo login. Ver docs/perfilamiento-usuario-plan.md.
ALTER TABLE "user" ADD COLUMN "perfil_completado_at" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "perfil_segmento" VARCHAR(40);
ALTER TABLE "user" ADD COLUMN "perfil_objetivo" VARCHAR(40);
ALTER TABLE "user" ADD COLUMN "perfil_obstaculo" VARCHAR(40);
ALTER TABLE "user" ADD COLUMN "perfil_respuestas" JSONB;

-- Para analítica de segmentación por tenant (distribución de perfiles).
CREATE INDEX "user_perfil_segmento_idx" ON "user"("tenant_id", "perfil_segmento");
