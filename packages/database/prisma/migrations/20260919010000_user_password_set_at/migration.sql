-- Marca de "primera vez que el usuario definió su contraseña" (link mágico del alta).
-- Sirve para avisar a n8n/GHL solo la primera vez, no en cada reset.
ALTER TABLE "user" ADD COLUMN "password_set_at" TIMESTAMP(3);

-- Backfill: los usuarios que ya han iniciado sesión alguna vez ya definieron su
-- contraseña; se marcan como tal para que un reset futuro NO cuente como "primera
-- vez". Los que nunca han entrado (p. ej. un alta reciente que aún no usó el link)
-- quedan en NULL y su primera definición sí disparará el aviso.
UPDATE "user" SET "password_set_at" = "last_login_at" WHERE "last_login_at" IS NOT NULL;
