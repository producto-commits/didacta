-- Origen del alta + marca de "registrado en Dropi" para la misión de bienvenida
-- (banner "Regístrate en Dropi", solo para altas por el link público /registro).
ALTER TABLE "user" ADD COLUMN "registration_source" VARCHAR(40);
ALTER TABLE "user" ADD COLUMN "dropi_registered_at" TIMESTAMPTZ;
