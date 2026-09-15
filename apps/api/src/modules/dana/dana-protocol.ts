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

export interface DanaConfig {
  webhookUrl: string;
  secret: string | null;
  timeoutMs: number;
  /** Horas sin actividad tras las que el siguiente mensaje abre otra conversación. */
  conversationTtlHours: number;
}

export function danaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DanaConfig | null {
  const webhookUrl = env['DANA_WEBHOOK_URL']?.trim();
  if (!webhookUrl) return null;
  const timeout = Number(env['DANA_TIMEOUT_MS']);
  const ttl = Number(env['DANA_CONVERSATION_TTL_HOURS']);
  return {
    webhookUrl,
    secret: env['DANA_WEBHOOK_SECRET']?.trim() || null,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20_000,
    conversationTtlHours: Number.isFinite(ttl) && ttl > 0 ? ttl : 24,
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
 * Decide la conversación del siguiente mensaje: se reutiliza la última si tuvo
 * actividad hace menos de `ttlHours`; si no (o si el alumno pidió una nueva),
 * se abre otra. Puro para testear.
 */
export function resolveConversationId(
  last: { conversationId: string | null; createdAt: Date } | null,
  now: Date,
  ttlHours: number,
  newId: () => string,
  forceNew = false,
): string {
  if (forceNew || !last || !last.conversationId) return newId();
  const ageMs = now.getTime() - last.createdAt.getTime();
  return ageMs <= ttlHours * 3_600_000 ? last.conversationId : newId();
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
