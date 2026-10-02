/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente HTTP directo a GoHighLevel (LeadConnector API v2).
 *
 * Sustituye el salto por n8n para las integraciones salientes: Academy llama a
 * GHL con el token del tenant (guardado cifrado en `tenant_setting` scope `ghl`,
 * key `connection`) y el `contactId` que ya viaja en el usuario (`ghl_contact_id`,
 * poblado por el flujo `/inscribe`). El `locationId` identifica la sub-cuenta.
 *
 * Sólo cubre lo que hoy necesita el flujo de retos (aplicar etiquetas) + una
 * verificación de credenciales. Se irá ampliando a medida que migremos más
 * flujos fuera de n8n (upsert de contacto, disparar workflows, etc.).
 *
 * No lanza para el camino feliz de escritura salvo error real de red/HTTP; el
 * bridge de retos envuelve la llamada en best-effort para que un fallo de GHL
 * nunca deshaga la completitud del reto.
 */

/** URL base de la API v2 de GHL. Override por env para tests/mocks. */
const GHL_API_BASE_URL =
  process.env.GHL_API_BASE_URL?.trim() || 'https://services.leadconnectorhq.com';
/** Versión de API que GHL exige en el header `Version`. */
const GHL_API_VERSION = '2021-07-28';
const REQUEST_TIMEOUT_MS = 8_000;

/** Error de la API de GHL con status + detalle legible (no secreto). */
export class GhlApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
    this.name = 'GhlApiError';
  }
}

@Injectable()
export class GhlClientService {
  private readonly logger = new Logger(GhlClientService.name);

  /**
   * Aplica una o más etiquetas a un contacto. Es ADITIVO (no reemplaza las
   * etiquetas existentes del contacto) — usa el endpoint dedicado de tags.
   */
  async addContactTags(
    token: string,
    contactId: string,
    tags: string[],
  ): Promise<{ tags: string[] }> {
    const body = await this.request<{ tags?: string[] }>(
      token,
      'POST',
      `/contacts/${encodeURIComponent(contactId)}/tags`,
      { tags },
    );
    return { tags: body.tags ?? tags };
  }

  /**
   * Verifica que el token puede leer la sub-cuenta indicada. Devuelve el nombre
   * de la location para que el admin confirme que apuntó a la cuenta correcta.
   */
  async verifyToken(
    token: string,
    locationId: string,
  ): Promise<{ ok: true; locationName: string | null }> {
    const body = await this.request<{ location?: { name?: string | null } }>(
      token,
      'GET',
      `/locations/${encodeURIComponent(locationId)}`,
    );
    return { ok: true, locationName: body.location?.name ?? null };
  }

  /**
   * Crea o actualiza un contacto en una sub-cuenta (location). GHL deduplica por
   * email/teléfono DENTRO de la location: si ya existe uno con ese email o
   * teléfono lo devuelve (actualizado), si no lo crea. Devuelve el id del
   * contacto (nuevo o existente) para guardarlo en el usuario.
   */
  async upsertContact(
    token: string,
    input: {
      locationId: string;
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<{ contactId: string | null; isNew: boolean }> {
    const body = await this.request<{ contact?: { id?: string }; new?: boolean }>(
      token,
      'POST',
      '/contacts/upsert',
      {
        locationId: input.locationId,
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.firstName ? { firstName: input.firstName } : {}),
        ...(input.lastName ? { lastName: input.lastName } : {}),
      },
    );
    return { contactId: body.contact?.id ?? null, isNew: body.new ?? false };
  }

  private async request<T>(
    token: string,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${GHL_API_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: GHL_API_VERSION,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      // Aborto por timeout o fallo de red: no es un secreto, va en el detalle.
      const detail =
        (err as Error).name === 'AbortError'
          ? `GHL no respondió en ${REQUEST_TIMEOUT_MS} ms`
          : `Fallo de red hacia GHL: ${(err as Error).message}`;
      throw new GhlApiError(detail, 0, detail);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // El cuerpo de error de GHL trae el motivo (token inválido, contacto
      // inexistente, scope faltante…) — útil para diagnosticar, no es secreto.
      const raw = await res.text().catch(() => '');
      const detail = extractGhlError(raw) || `HTTP ${res.status}`;
      throw new GhlApiError(`GHL rechazó la petición: ${detail}`, res.status, detail);
    }

    if (res.status === 204) return {} as T;
    return (await res.json().catch(() => ({}))) as T;
  }
}

/** Extrae un mensaje legible del cuerpo de error de GHL (JSON o texto plano). */
function extractGhlError(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown };
    const msg = parsed.message ?? parsed.error;
    if (typeof msg === 'string') return msg.slice(0, 300);
    if (Array.isArray(msg)) return msg.map(String).join('; ').slice(0, 300);
  } catch {
    // No era JSON.
  }
  return raw.slice(0, 300);
}
