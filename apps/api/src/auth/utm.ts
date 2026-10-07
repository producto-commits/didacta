/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Atribución de campañas: las UTM (y click ids de Meta/Google) llegan en la URL
 * de `/registro`, pero el link para fijar contraseña viaja por EMAIL y las
 * perdería. Para no romper la cadena de atribución (registro → fijar contraseña
 * → login) las re-inyectamos en el link del email. Aquí va solo el whitelisting
 * y el armado del query string; la captura (navegador) vive en la web.
 */

/** Únicas claves que aceptamos reflejar en los links (evita pass-through abierto). */
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
] as const;

/**
 * Query string (`k=v&k=v`, ya URL-encoded) con SOLO las claves conocidas y no
 * vacías de `utm`. Cadena vacía si no hay ninguna.
 */
export function buildUtmQuery(utm: Record<string, string> | undefined): string {
  if (!utm) return '';
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
  }
  return params.toString();
}

/** Añade `query` (ya encoded) a `url`, eligiendo `?` o `&`. No-op si vacío. */
export function appendQuery(url: string, query: string): string {
  if (!query) return url;
  return url + (url.includes('?') ? '&' : '?') + query;
}

/**
 * Objeto con SOLO las claves conocidas y no vacías de `utm`, para mandarlas como
 * `custom_data` en los eventos de Meta. `{}` si no hay ninguna.
 */
export function pickUtm(utm: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!utm) return out;
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return out;
}
