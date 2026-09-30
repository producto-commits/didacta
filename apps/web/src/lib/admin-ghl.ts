/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Cliente HTTP del controlador admin de la conexión GHL per-tenant (backend en
 * `apps/api/src/admin/admin-ghl.controller.ts`).
 *
 * Endpoints dedicados:
 *  - `GET  /api/v1/admin/tenant-settings/ghl` → estado, sin el token.
 *  - `PUT  /api/v1/admin/tenant-settings/ghl` → upsert. `token`/`locationId`
 *    opcionales: vacíos conservan lo guardado. Reset de `verifiedAt`.
 *  - `POST /api/v1/admin/tenant-settings/ghl/test` → verifica el token contra
 *    GHL. Si éxito → 200 + marca `verifiedAt`. Si falla → 400 con el error de GHL.
 *
 * Espeja `admin-smtp.ts` / `admin-stripe`: contrato DTO plano en vez del
 * almacenamiento genérico de `tenant_setting`.
 */

import { ApiHttpError, apiFetch } from './api-client';
import { authStorage } from './auth-storage';

export interface AdminGhlDto {
  /** True si hay token guardado (el cleartext nunca sale de la API). */
  hasToken: boolean;
  /** Sub-cuenta (location) por defecto contra la que se verifica el token. */
  locationId: string | null;
  /** Nombre de la location de la última verificación exitosa. */
  locationName: string | null;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  /** True si el tenant tiene conexión propia guardada. */
  hasTenantConfig: boolean;
}

export interface AdminGhlUpsertPayload {
  /** Opcional: si viene vacío o ausente, se conserva el token guardado. */
  token?: string;
  /** Opcional: si viene vacío o ausente, se conserva el locationId guardado. */
  locationId?: string;
}

export interface AdminGhlTestResult {
  ok: true;
  locationName: string | null;
  verifiedAt: string;
}

function withAuth(): string {
  const token = authStorage.getAccessToken();
  if (!token)
    throw new ApiHttpError({ message: 'Sesión expirada', status: 401, code: 'sessionExpired' });
  return token;
}

export const adminGhlApi = {
  async get(): Promise<AdminGhlDto> {
    return apiFetch<AdminGhlDto>(
      '/api/v1/admin/tenant-settings/ghl',
      { method: 'GET' },
      withAuth(),
    );
  },
  async upsert(payload: AdminGhlUpsertPayload): Promise<AdminGhlDto> {
    return apiFetch<AdminGhlDto>(
      '/api/v1/admin/tenant-settings/ghl',
      { method: 'PUT', body: JSON.stringify(payload) },
      withAuth(),
    );
  },
  async test(): Promise<AdminGhlTestResult> {
    return apiFetch<AdminGhlTestResult>(
      '/api/v1/admin/tenant-settings/ghl/test',
      { method: 'POST', body: JSON.stringify({}) },
      withAuth(),
    );
  },
  /**
   * Elimina la conexión GHL del tenant. No hay endpoint dedicado; se borran las
   * dos rows (`ghl/connection` + `ghl/connection_meta`) por el controlador
   * genérico de tenant-settings.
   */
  async remove(): Promise<void> {
    const bearer = withAuth();
    const del = (key: string) =>
      apiFetch<{ ok: true }>(
        `/api/v1/tenant-settings/ghl/${key}`,
        { method: 'DELETE' },
        bearer,
      ).catch((err) => {
        if (err instanceof ApiHttpError && err.status === 404) return { ok: true } as const;
        throw err;
      });
    await del('connection');
    await del('connection_meta');
  },
};

export type AdminGhlStatus = 'verified' | 'configured-unverified' | 'none';

/** Deriva el estado del banner. Centralizado para compartir con los tests. */
export function deriveGhlStatus(dto: AdminGhlDto): AdminGhlStatus {
  if (dto.hasTenantConfig && dto.verifiedAt) return 'verified';
  if (dto.hasTenantConfig) return 'configured-unverified';
  return 'none';
}
