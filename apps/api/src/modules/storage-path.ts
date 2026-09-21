/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Ruta pública ESTABLE de un objeto del storage. Es lo que se persiste (en
 * `thumbnail_url`, `cover_url`, `avatar_url`, adjuntos…), NUNCA una URL
 * pre-firmada: la firma de S3 caduca (TTL por defecto 15 min) y la imagen se
 * rompería al expirar. `StorageFileController` resuelve esta ruta en cada GET —
 * con S3 redirige (302) a un GET firmado fresco, con disco local sirve los
 * bytes— así el enlace guardado no vence nunca. Mismo patrón que el vídeo
 * (`/api/v1/storage/video/<key>`).
 */
export const STORAGE_FILE_PREFIX = '/api/v1/storage/file/';

/** Construye la ruta estable para una storage key. */
export function storageAssetPath(key: string): string {
  return STORAGE_FILE_PREFIX + key.replace(/^\/+/, '');
}

/**
 * Extrae la storage key de un valor guardado, sea una ruta estable
 * (`/api/v1/storage/file/<key>`), una URL pre-firmada de S3 antigua, o una key
 * cruda. Se apoya en que TODAS nuestras keys viven bajo `tenants/…`, así no
 * necesita conocer el bucket/endpoint. Devuelve null si la URL no apunta a
 * nuestro storage (un CDN externo, una imagen pegada a mano); solo leemos de
 * nuestro propio adapter, así que no hay riesgo de SSRF.
 */
export function extractStorageKey(url: string): string | null {
  if (!url) return null;
  const i = url.indexOf(STORAGE_FILE_PREFIX);
  if (i !== -1) {
    let key = url
      .slice(i + STORAGE_FILE_PREFIX.length)
      .split('?')[0]!
      .split('#')[0]!;
    try {
      key = decodeURIComponent(key);
    } catch {
      // Si el decode falla dejamos la key tal cual; el adapter la saneará.
    }
    return key || null;
  }
  const m = /(tenants\/[^?#\s"']+)/.exec(url);
  if (m) {
    try {
      return decodeURIComponent(m[1]!);
    } catch {
      return m[1]!;
    }
  }
  return null;
}
