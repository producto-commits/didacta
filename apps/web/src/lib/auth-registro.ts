/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Cliente del registro público por el link de captación
 * (`POST /api/v1/auth/registro`). Sin sesión: no lleva bearer. El backend crea
 * el alumno + el contacto en GHL y envía un email con el enlace para fijar
 * contraseña (que es la puerta de entrada). Ver RegistroService.
 */

import { apiFetch } from './api-client';

export interface RegistroPayload {
  email: string;
  firstName: string;
  lastName: string;
  /** E.164 con indicativo, ej. `+543001234567`. */
  phone: string;
  /** UTM/click ids capturados en la URL de registro (atribución de campaña). */
  utm?: Record<string, string>;
}

export async function registro(payload: RegistroPayload): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/v1/auth/registro', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Página de Dropi que avisa a Meta del registro y devuelve a la persona a
 * Academy. El form redirige aquí (misma pestaña) tras un registro con éxito.
 */
export const DROPI_BIENVENIDA_URL = 'https://dropi.co/ar/curso-dropshipping-bienvenida';

/**
 * Indicativos para el selector de país del teléfono. Lista corta centrada en
 * LatAm (el público de Dropi) + ES/US. Default Argentina (+54). `iso` solo para
 * la bandera emoji; lo que se envía es `dial` + el número.
 */
export interface Country {
  iso: string;
  name: string;
  dial: string;
}

export const COUNTRIES: readonly Country[] = [
  { iso: 'AR', name: 'Argentina', dial: '+54' },
  { iso: 'CO', name: 'Colombia', dial: '+57' },
  { iso: 'MX', name: 'México', dial: '+52' },
  { iso: 'PE', name: 'Perú', dial: '+51' },
  { iso: 'CL', name: 'Chile', dial: '+56' },
  { iso: 'EC', name: 'Ecuador', dial: '+593' },
  { iso: 'BO', name: 'Bolivia', dial: '+591' },
  { iso: 'UY', name: 'Uruguay', dial: '+598' },
  { iso: 'PY', name: 'Paraguay', dial: '+595' },
  { iso: 'VE', name: 'Venezuela', dial: '+58' },
  { iso: 'PA', name: 'Panamá', dial: '+507' },
  { iso: 'CR', name: 'Costa Rica', dial: '+506' },
  { iso: 'GT', name: 'Guatemala', dial: '+502' },
  { iso: 'DO', name: 'Rep. Dominicana', dial: '+1' },
  { iso: 'ES', name: 'España', dial: '+34' },
  { iso: 'US', name: 'Estados Unidos', dial: '+1' },
] as const;

export const DEFAULT_COUNTRY_ISO = 'AR';

/** Bandera emoji a partir del ISO-3166 alpha-2 (A→🇦 …). */
export function flagEmoji(iso: string): string {
  if (iso.length !== 2) return '';
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (iso.toUpperCase().charCodeAt(0) - 65),
    base + (iso.toUpperCase().charCodeAt(1) - 65),
  );
}
