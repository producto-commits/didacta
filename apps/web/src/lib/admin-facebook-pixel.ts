/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Cliente del controlador admin del Pixel de Facebook per-tenant (backend en
 * `apps/api/src/admin/admin-facebook-pixel.controller.ts`).
 *  - `GET /api/v1/admin/tenant-settings/facebook-pixel` → { pixelId }.
 *  - `PUT …` → guarda (o borra, si va vacío) el Pixel ID.
 */

import { ApiHttpError, apiFetch } from './api-client';
import { authStorage } from './auth-storage';

export interface AdminFacebookPixelDto {
  pixelId: string | null;
  /** True si hay token CAPI guardado (el valor nunca viaja al cliente). */
  capiConfigured: boolean;
}

function withAuth(): string {
  const token = authStorage.getAccessToken();
  if (!token)
    throw new ApiHttpError({ message: 'Sesión expirada', status: 401, code: 'sessionExpired' });
  return token;
}

export const adminFacebookPixelApi = {
  async get(): Promise<AdminFacebookPixelDto> {
    return apiFetch<AdminFacebookPixelDto>(
      '/api/v1/admin/tenant-settings/facebook-pixel',
      { method: 'GET' },
      withAuth(),
    );
  },
  /**
   * Guarda el Pixel ID y, opcionalmente, el token CAPI. `capiToken`:
   * `undefined` = no tocar, `''` = borrar, otro = guardar cifrado.
   */
  async save(pixelId: string, capiToken?: string): Promise<AdminFacebookPixelDto> {
    return apiFetch<AdminFacebookPixelDto>(
      '/api/v1/admin/tenant-settings/facebook-pixel',
      {
        method: 'PUT',
        body: JSON.stringify({ pixelId, ...(capiToken !== undefined ? { capiToken } : {}) }),
      },
      withAuth(),
    );
  },
};
