-- CreateTable
CREATE TABLE "mod_profile_answer" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_key" VARCHAR(64) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mod_profile_answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mod_profile_answer_tenant_id_user_id_question_key_key" ON "mod_profile_answer"("tenant_id", "user_id", "question_key");

-- CreateIndex
CREATE INDEX "mod_profile_answer_tenant_id_question_key_idx" ON "mod_profile_answer"("tenant_id", "question_key");
