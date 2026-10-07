/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Atribución de campañas en el navegador. Las UTM (y click ids de Meta/Google)
 * llegan en la URL de `/registro`. Como el link para fijar contraseña viaja por
 * email y las perdería, las capturamos aquí y las propagamos: al backend (que
 * las reinyecta en el link del email) y a las redirecciones (página de Dropi,
 * post-login), para no romper la atribución en registro → contraseña → login.
 */

/** Claves de atribución que capturamos y propagamos. */
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
] as const;

/** Lee las claves conocidas y no vacías de un query string (o de la URL actual). */
export function readUtms(search?: string): Record<string, string> {
  if (search === undefined && typeof window === 'undefined') return {};
  const params = new URLSearchParams(
    search ?? (typeof window !== 'undefined' ? window.location.search : ''),
  );
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value && value.trim()) out[key] = value.trim();
  }
  return out;
}

/** Query string (`k=v&…`, URL-encoded) con las UTM; vacío si no hay ninguna. */
export function utmQueryString(utms: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) {
    if (utms[key]) params.set(key, utms[key]);
  }
  return params.toString();
}

/** Añade las UTM a `url` (elige `?` o `&`). No-op si no hay UTM. */
export function appendUtms(url: string, utms: Record<string, string>): string {
  const query = utmQueryString(utms);
  if (!query) return url;
  return url + (url.includes('?') ? '&' : '?') + query;
}
