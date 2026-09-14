/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { apiFetch } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

/** Cliente del chat con Dana (agente n8n): GET/POST /api/v1/me/dana. */

export interface DanaMessage {
  id: string;
  direction: 'IN' | 'OUT';
  text: string;
  status: string;
  createdAt: string;
}

function bearer(): string | undefined {
  return authStorage.getAccessToken() ?? undefined;
}

const BASE = '/api/v1/me/dana';

export const danaApi = {
  status(): Promise<{ enabled: boolean }> {
    return apiFetch(`${BASE}/status`, { method: 'GET' }, bearer());
  },
  list(since?: string): Promise<DanaMessage[]> {
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    return apiFetch(`${BASE}/messages${q}`, { method: 'GET' }, bearer());
  },
  send(mensaje: string): Promise<{ sent: DanaMessage; reply: DanaMessage | null }> {
    return apiFetch(
      `${BASE}/messages`,
      { method: 'POST', body: JSON.stringify({ mensaje }) },
      bearer(),
    );
  },
};
