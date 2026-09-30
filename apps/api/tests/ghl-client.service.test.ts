/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Contrato del cliente directo a GoHighLevel (sin n8n). Verifica que:
 *  - `addContactTags` pega al endpoint correcto con Bearer + header Version y
 *    el body `{ tags }` (camino feliz).
 *  - un 4xx de GHL se convierte en `GhlApiError` con el detalle extraído del
 *    cuerpo (control: demuestra que la comprobación discrimina éxito de fallo).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GhlApiError, GhlClientService } from '../src/integrations/ghl/ghl-client.service';

function mockFetchOnce(res: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
}): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: res.ok,
    status: res.status,
    json: async () => res.json ?? {},
    text: async () => res.text ?? '',
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('GhlClientService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('addContactTags: POST /contacts/:id/tags con Bearer, Version y body {tags}', async () => {
    const fetchFn = mockFetchOnce({ ok: true, status: 200, json: { tags: ['bienvenido-1'] } });
    const svc = new GhlClientService();

    const out = await svc.addContactTags('tok-123', 'contact-abc', ['bienvenido-1']);

    expect(out.tags).toEqual(['bienvenido-1']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/contacts/contact-abc/tags');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
    expect(headers.Version).toBe('2021-07-28');
    expect(JSON.parse(init.body as string)).toEqual({ tags: ['bienvenido-1'] });
  });

  it('CONTROL: un 401 de GHL lanza GhlApiError con el detalle del cuerpo', async () => {
    mockFetchOnce({ ok: false, status: 401, text: JSON.stringify({ message: 'Invalid token' }) });
    const svc = new GhlClientService();

    await expect(svc.addContactTags('bad', 'contact-abc', ['x'])).rejects.toMatchObject({
      name: 'GhlApiError',
      status: 401,
      detail: 'Invalid token',
    });
  });

  it('verifyToken: GET /locations/:id devuelve el nombre de la sub-cuenta', async () => {
    const fetchFn = mockFetchOnce({
      ok: true,
      status: 200,
      json: { location: { name: 'Dropi Colombia' } },
    });
    const svc = new GhlClientService();

    const out = await svc.verifyToken('tok', 'loc-1');

    expect(out).toEqual({ ok: true, locationName: 'Dropi Colombia' });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/locations/loc-1');
    expect(init.method ?? 'GET').toBe('GET');
    expect(GhlApiError).toBeDefined();
  });
});
