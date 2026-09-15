/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { apiFetch } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

/** Cliente del chat con Dana (agente n8n): GET/POST /api/v1/me/dana. */

export interface DanaMessage {
  id: string;
  conversationId: string | null;
  direction: 'IN' | 'OUT';
  text: string;
  status: string;
  createdAt: string;
}

export interface DanaConversation {
  id: string;
  title: string;
  lastText: string;
  lastDirection: 'IN' | 'OUT';
  lastAt: string;
  count: number;
  /** Sigue activa: el siguiente mensaje se cuelga de ella. */
  open: boolean;
}

function bearer(): string | undefined {
  return authStorage.getAccessToken() ?? undefined;
}

const BASE = '/api/v1/me/dana';

export const danaApi = {
  status(): Promise<{ enabled: boolean }> {
    return apiFetch(`${BASE}/status`, { method: 'GET' }, bearer());
  },
  conversations(): Promise<DanaConversation[]> {
    return apiFetch(`${BASE}/conversations`, { method: 'GET' }, bearer());
  },
  list(opts: { since?: string; conversationId?: string } = {}): Promise<DanaMessage[]> {
    const q = new URLSearchParams();
    if (opts.since) q.set('since', opts.since);
    if (opts.conversationId) q.set('conversationId', opts.conversationId);
    const qs = q.toString();
    return apiFetch(`${BASE}/messages${qs ? `?${qs}` : ''}`, { method: 'GET' }, bearer());
  },
  send(
    mensaje: string,
    opts: { nuevaConversacion?: boolean } = {},
  ): Promise<{ sent: DanaMessage; reply: DanaMessage | null; conversationId: string }> {
    return apiFetch(
      `${BASE}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ mensaje, nuevaConversacion: opts.nuevaConversacion === true }),
      },
      bearer(),
    );
  },
};
