-- Portadas, avatares y portadas de colección se guardaban como URL PRE-FIRMADA
-- de S3 (TTL 15 min por defecto). Al expirar la firma, la imagen dejaba de
-- cargar ("la portada se daña con el tiempo"). Ahora se persiste la RUTA ESTABLE
-- `/api/v1/storage/file/<key>`, que `StorageFileController` re-firma en cada GET.
--
-- Esta migración reescribe las filas ya guardadas: extrae la key (todas viven
-- bajo `tenants/…`, así no hace falta conocer el bucket/endpoint) y la vuelve a
-- montar como ruta estable. Solo toca valores de NUESTRO storage (que contienen
-- `tenants/`) y que aún no son rutas estables. Idempotente.

UPDATE "mod_courses_course"
SET "thumbnail_url" = '/api/v1/storage/file/' || substring("thumbnail_url" from 'tenants/[^?]+')
WHERE "thumbnail_url" ~ 'tenants/'
  AND "thumbnail_url" NOT LIKE '/api/v1/storage/file/%';

UPDATE "mod_resources_collection"
SET "cover_url" = '/api/v1/storage/file/' || substring("cover_url" from 'tenants/[^?]+')
WHERE "cover_url" ~ 'tenants/'
  AND "cover_url" NOT LIKE '/api/v1/storage/file/%';

UPDATE "user"
SET "avatar_url" = '/api/v1/storage/file/' || substring("avatar_url" from 'tenants/[^?]+')
WHERE "avatar_url" ~ 'tenants/'
  AND "avatar_url" NOT LIKE '/api/v1/storage/file/%';
