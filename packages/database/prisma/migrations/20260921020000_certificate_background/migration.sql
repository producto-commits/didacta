-- Imagen de fondo del certificado: el diseño ya maquetado (subido desde el PC)
-- que se dibuja a página completa detrás del texto. Opcional; NULL = layout por
-- defecto dibujado por el renderer.
ALTER TABLE "mod_certificates_template" ADD COLUMN "background_url" TEXT;
