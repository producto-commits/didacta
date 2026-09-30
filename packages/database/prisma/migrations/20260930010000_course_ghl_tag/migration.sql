-- Código corto por curso para componer la etiqueta de GHL al completar un reto
-- (`<ghl_tag>-<reto.key>`). Nullable, sin backfill ni índice.
ALTER TABLE "mod_courses_course" ADD COLUMN "ghl_tag" VARCHAR(60);
