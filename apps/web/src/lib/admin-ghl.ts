/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Cliente HTTP del controlador admin de conexiones GHL per-tenant (backend en
 * `apps/api/src/admin/admin-ghl.controller.ts`).
 *
 * El tenant puede tener VARIAS conexiones (una por sub-cuenta/location de GHL).
 * Endpoints:
 *  - `GET    /api/v1/admin/tenant-settings/ghl` → lista, sin los tokens.
 *  - `POST   /api/v1/admin/tenant-settings/ghl` → agrega/rota una: verifica el
 *    token contra GHL y, si es válido, la guarda con el nombre resuelto.
 *  - `DELETE /api/v1/admin/tenant-settings/ghl/:locationId` → elimina una.
 */

import { ApiHttpError, apiFetch } from './api-client';
import { authStorage } from './auth-storage';

/** Vista pública de una conexión (sin el token). */
export interface AdminGhlConnection {
  locationId: string;
  locationName: string | null;
  verifiedAt: string | null;
}

export interface AdminGhlListDto {
  connections: AdminGhlConnection[];
}

export interface AdminGhlAddPayload {
  token: string;
  locationId: string;
}

function withAuth(): string {
  const token = authStorage.getAccessToken();
  if (!token)
    throw new ApiHttpError({ message: 'Sesión expirada', status: 401, code: 'sessionExpired' });
  return token;
}

export const adminGhlApi = {
  async list(): Promise<AdminGhlListDto> {
    return apiFetch<AdminGhlListDto>(
      '/api/v1/admin/tenant-settings/ghl',
      { method: 'GET' },
      withAuth(),
    );
  },
  /** Verifica y guarda una conexión. Devuelve la lista + la que se agregó. */
  async add(payload: AdminGhlAddPayload): Promise<AdminGhlListDto & { added: AdminGhlConnection }> {
    return apiFetch<AdminGhlListDto & { added: AdminGhlConnection }>(
      '/api/v1/admin/tenant-settings/ghl',
      { method: 'POST', body: JSON.stringify(payload) },
      withAuth(),
    );
  },
  async remove(locationId: string): Promise<AdminGhlListDto> {
    return apiFetch<AdminGhlListDto>(
      `/api/v1/admin/tenant-settings/ghl/${encodeURIComponent(locationId)}`,
      { method: 'DELETE' },
      withAuth(),
    );
  },
};
