/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Protocolo con Dana, el agente n8n de Dropi Academy (docs/retos/plan-retos.md
 * §3.5, Fase E). Módulo PURO para poder testearlo.
 *
 *   Salida (nosotros → n8n):  POST DANA_WEBHOOK_URL
 *     { mensaje, correo, userId, tenantId, messageId }   + X-Dana-Secret
 *   Entrada (n8n → nosotros): POST /api/v1/webhooks/dana
 *     { correo, mensaje }                                 + X-Dana-Secret
 *
 * n8n puede responder también de forma síncrona al POST de salida con
 * `{ mensaje }`: si lo hace, se guarda como respuesta al instante.
 */

/** Inactividad por defecto tras la que la conversación se cierra: 30 minutos. */
export const DANA_DEFAULT_TTL_MS = 30 * 60_000;

export interface DanaConfig {
  webhookUrl: string;
  secret: string | null;
  timeoutMs: number;
  /** Milisegundos sin actividad tras los que la conversación se cierra. */
  conversationTtlMs: number;
}

export function danaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DanaConfig | null {
  const webhookUrl = env['DANA_WEBHOOK_URL']?.trim();
  if (!webhookUrl) return null;
  const timeout = Number(env['DANA_TIMEOUT_MS']);
  // Ventana de inactividad: se prefiere en MINUTOS; se acepta el legacy en horas.
  const minutes = Number(env['DANA_CONVERSATION_TTL_MINUTES']);
  const hours = Number(env['DANA_CONVERSATION_TTL_HOURS']);
  let conversationTtlMs = DANA_DEFAULT_TTL_MS;
  if (Number.isFinite(minutes) && minutes > 0) conversationTtlMs = minutes * 60_000;
  else if (Number.isFinite(hours) && hours > 0) conversationTtlMs = hours * 3_600_000;
  return {
    webhookUrl,
    secret: env['DANA_WEBHOOK_SECRET']?.trim() || null,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20_000,
    conversationTtlMs,
  };
}

export interface OutboundPayload {
  mensaje: string;
  correo: string;
  /** Conversación (hilo) del alumno: n8n puede usarlo como memoria por sesión. */
  conversacionId: string;
  userId: string;
  tenantId: string;
  messageId: string;
}

/** Cuerpo que se manda a n8n. */
export function buildOutboundPayload(p: OutboundPayload): OutboundPayload {
  return {
    mensaje: p.mensaje.trim().slice(0, 4000),
    correo: p.correo.trim().toLowerCase(),
    conversacionId: p.conversacionId,
    userId: p.userId,
    tenantId: p.tenantId,
    messageId: p.messageId,
  };
}

/**
 * Decide la conversación del siguiente mensaje: se reutiliza la última si NO
 * está cerrada y tuvo actividad hace menos de `reuseWindowMs`; si no (o si el
 * alumno pidió una nueva), se abre otra. Puro para testear.
 */
export function resolveConversationId(
  last: { conversationId: string | null; createdAt: Date; closed?: boolean } | null,
  now: Date,
  reuseWindowMs: number,
  newId: () => string,
  forceNew = false,
): string {
  if (forceNew || !last || !last.conversationId || last.closed) return newId();
  const ageMs = now.getTime() - last.createdAt.getTime();
  return ageMs <= reuseWindowMs ? last.conversationId : newId();
}

/** Estados de un mensaje. NUDGE/CLOSED son mensajes de sistema (OUT). */
export const DANA_NUDGE_STATUS = 'NUDGE';
export const DANA_CLOSED_STATUS = 'CLOSED';

export type InactivityAction = 'nudge' | 'close' | null;

/**
 * Regla de inactividad, mirando SOLO el último mensaje de la conversación:
 *   - ya cerrada → nada.
 *   - último = aviso "¿sigues ahí?" y pasó otra ventana sin respuesta → cerrar.
 *   - último = actividad real y pasó una ventana → avisar (o cerrar directo si
 *     se pasó también la segunda ventana, p. ej. el barrido estuvo caído).
 * `ttlMs` es la ventana de inactividad (30 min por defecto). Pura para testear.
 */
export function decideInactivityAction(
  last: { status: string; createdAt: Date },
  now: Date,
  ttlMs: number,
): InactivityAction {
  const idle = now.getTime() - last.createdAt.getTime();
  if (last.status === DANA_CLOSED_STATUS) return null;
  if (last.status === DANA_NUDGE_STATUS) return idle >= ttlMs ? 'close' : null;
  if (idle >= 2 * ttlMs) return 'close';
  if (idle >= ttlMs) return 'nudge';
  return null;
}

/** Extrae una respuesta síncrona `{ mensaje }` (o `{ respuesta }`/`{ output }`) si n8n la devuelve. */
export function parseSyncReply(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  for (const k of ['mensaje', 'respuesta', 'output', 'text']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 4000);
  }
  return null;
}

export interface InboundMessage {
  correo: string;
  mensaje: string;
  /** Si n8n lo devuelve, la respuesta se cuelga de esa conversación. */
  conversacionId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida el callback de n8n. Devuelve null si falta correo o mensaje. */
export function parseInbound(body: unknown): InboundMessage | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const correo = typeof o['correo'] === 'string' ? o['correo'].trim().toLowerCase() : '';
  const mensaje = typeof o['mensaje'] === 'string' ? o['mensaje'].trim() : '';
  if (!correo || !correo.includes('@') || !mensaje) return null;
  const conv = typeof o['conversacionId'] === 'string' ? o['conversacionId'].trim() : '';
  return {
    correo,
    mensaje: mensaje.slice(0, 4000),
    conversacionId: UUID_RE.test(conv) ? conv.toLowerCase() : null,
  };
}

/** Comparación en tiempo constante del secreto compartido (hash para igualar longitudes). */
export function secretMatches(
  expected: string | null,
  provided: string | undefined | null,
): boolean {
  // Sin secreto configurado se acepta cualquier callback (solo para pruebas):
  // en producción DANA_WEBHOOK_SECRET debe estar puesto.
  if (!expected) return true;
  if (!provided) return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(provided).digest();
  return timingSafeEqual(a, b);
}
