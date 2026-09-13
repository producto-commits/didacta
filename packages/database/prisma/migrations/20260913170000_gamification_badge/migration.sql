-- CreateTable
CREATE TABLE "mod_gamification_badge" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "emoji" VARCHAR(16),
    "source_key" VARCHAR(160) NOT NULL,
    "meta" JSONB,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mod_gamification_badge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mod_gamification_badge_tenant_id_user_id_badge_key_key" ON "mod_gamification_badge"("tenant_id", "user_id", "badge_key");

-- CreateIndex
CREATE INDEX "mod_gamification_badge_tenant_id_user_id_granted_at_idx" ON "mod_gamification_badge"("tenant_id", "user_id", "granted_at" DESC);
