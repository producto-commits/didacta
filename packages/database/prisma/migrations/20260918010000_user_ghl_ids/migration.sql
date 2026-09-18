-- IDs de GoHighLevel (CRM) en el contacto/usuario, para el alta externa (n8n/GHL).
ALTER TABLE "user" ADD COLUMN "ghl_contact_id" VARCHAR(64);
ALTER TABLE "user" ADD COLUMN "ghl_location_id" VARCHAR(64);

CREATE INDEX "user_ghl_contact_idx" ON "user"("tenant_id", "ghl_contact_id");
