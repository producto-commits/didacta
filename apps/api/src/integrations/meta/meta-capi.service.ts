/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

/** Versión del Graph API de Meta para el endpoint de Conversions API. */
const GRAPH_VERSION = 'v21.0';

export interface MetaCapiUserData {
  email?: string | null;
  /** Teléfono en cualquier formato; se normaliza a solo dígitos con prefijo país. */
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface MetaCapiEventInput {
  pixelId: string;
  /** Access token de la Conversions API (System User). Secreto. */
  token: string;
  /** Mismo `eventID` que el pixel del navegador, para que Meta deduplique. */
  eventId: string;
  eventName: string;
  eventSourceUrl?: string | null;
  user: MetaCapiUserData;
}

/** SHA-256 en hex de un valor ya normalizado. '' → undefined (no se envía). */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashEmail(email?: string | null): string | undefined {
  const v = (email ?? '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

function hashPhone(phone?: string | null): string | undefined {
  // Meta exige solo dígitos, con prefijo de país y sin '+' ni separadores.
  const v = (phone ?? '').replace(/[^0-9]/g, '');
  return v ? sha256(v) : undefined;
}

function hashName(name?: string | null): string | undefined {
  const v = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return v ? sha256(v) : undefined;
}

/**
 * Conversions API de Meta (eventos server-side). Complementa al Pixel del
 * navegador: el mismo evento se manda también desde el servidor con `event_id`
 * compartido, de modo que Meta deduplica y el registro se contabiliza aunque el
 * navegador bloquee el pixel. Todo es best-effort: nunca lanza.
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);

  async sendEvent(input: MetaCapiEventInput): Promise<boolean> {
    const userData: Record<string, unknown> = {};
    const em = hashEmail(input.user.email);
    const ph = hashPhone(input.user.phone);
    const fn = hashName(input.user.firstName);
    const ln = hashName(input.user.lastName);
    if (em) userData.em = [em];
    if (ph) userData.ph = [ph];
    if (fn) userData.fn = [fn];
    if (ln) userData.ln = [ln];
    if (input.user.clientIp) userData.client_ip_address = input.user.clientIp;
    if (input.user.userAgent) userData.client_user_agent = input.user.userAgent;

    const body = {
      data: [
        {
          event_name: input.eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          event_id: input.eventId,
          ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
          user_data: userData,
        },
      ],
    };

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      input.pixelId,
    )}/events?access_token=${encodeURIComponent(input.token)}`;

    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        // El token/pixel nunca se loguea; solo el status y el error de Meta.
        this.logger.warn(
          `Meta CAPI ${input.eventName} → HTTP ${res.status}: ${detail.slice(0, 300)}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `Meta CAPI ${input.eventName} falló: ${(err as Error).message.slice(0, 200)}`,
      );
      return false;
    }
  }
}
