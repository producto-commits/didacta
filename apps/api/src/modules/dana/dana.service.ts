/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { randomUUID } from 'node:crypto';
import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { runAsTenant, runGlobalWithoutTenant } from '../../tenancy/tenant-context.storage';
import {
  buildOutboundPayload,
  danaConfigFromEnv,
  DANA_CLOSED_STATUS,
  DANA_NUDGE_STATUS,
  decideInactivityAction,
  parseSyncReply,
  resolveConversationId,
  type DanaConfig,
  type InboundMessage,
} from './dana-protocol';

/** Texto del aviso "¿sigues ahí?" y del cierre por inactividad (mensajes OUT). */
const DANA_NUDGE_TEXT =
  '👋 ¿Sigues ahí? Si necesitas algo más, escríbeme. Si no, cerraré esta conversación en unos minutos.';
const DANA_CLOSED_TEXT =
  'Conversación cerrada por inactividad. Escribe un mensaje cuando quieras y empezamos de nuevo. 👋';

export interface DanaMessageView {
  id: string;
  conversationId: string | null;
  direction: 'IN' | 'OUT';
  text: string;
  status: string;
  createdAt: string;
}

export interface DanaConversationView {
  id: string;
  /** Primer mensaje del alumno (título del hilo en la lista). */
  title: string;
  lastText: string;
  lastDirection: 'IN' | 'OUT';
  lastAt: string;
  count: number;
  /** Sigue abierta: el siguiente mensaje se colgará de ella. */
  open: boolean;
}

/**
 * "Hablar con Dana" (docs/retos/plan-retos.md §3.5, Fase E/F): relé entre el
 * alumno y el agente n8n de Dropi Academy. Guarda cada mensaje (IN/OUT) para
 * pintar el hilo y para poder casar la respuesta asíncrona de n8n con el
 * alumno correcto (n8n devuelve `{ correo, mensaje, conversacionId? }`).
 *
 * Conversaciones: cada mensaje lleva un `conversacionId` que se manda a n8n
 * (memoria por sesión del agente). Inactividad (DANA_CONVERSATION_TTL_MINUTES,
 * 30 por defecto): tras una ventana en silencio Dana pregunta "¿sigues ahí?" y,
 * si pasa otra ventana sin respuesta, la conversación se cierra por inactividad
 * (lo hace `sweepInactive`, disparado por el worker). El alumno también puede
 * pulsar "Nueva conversación" para abrir otra.
 */
@Injectable()
export class DanaService {
  private readonly logger = new Logger(DanaService.name);
  private readonly config: DanaConfig | null = danaConfigFromEnv();

  constructor(private readonly prisma: PrismaService) {}

  get enabled(): boolean {
    return this.config !== null;
  }

  get secret(): string | null {
    return this.config?.secret ?? null;
  }

  async list(
    tenantId: string,
    userId: string,
    opts: { sinceIso?: string; conversationId?: string } = {},
  ): Promise<DanaMessageView[]> {
    const since = opts.sinceIso ? new Date(opts.sinceIso) : null;
    const rows = await this.prisma.modDanaMessage.findMany({
      where: {
        tenantId,
        userId,
        ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
        ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map(toView);
  }

  /** Conversaciones del alumno, la más reciente primero. */
  async conversations(tenantId: string, userId: string): Promise<DanaConversationView[]> {
    const rows = await this.prisma.modDanaMessage.findMany({
      where: { tenantId, userId, conversationId: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
      select: {
        conversationId: true,
        direction: true,
        text: true,
        status: true,
        createdAt: true,
      },
    });
    const map = new Map<string, DanaConversationView>();
    // Título = primer mensaje real del alumno; los OUT de sistema no lo pisan.
    const lastStatus = new Map<string, string>();
    for (const r of rows) {
      const id = r.conversationId!;
      const dir = r.direction === 'OUT' ? 'OUT' : 'IN';
      lastStatus.set(id, r.status);
      const cur = map.get(id);
      if (!cur) {
        map.set(id, {
          id,
          title: r.text.slice(0, 80),
          lastText: r.text,
          lastDirection: dir,
          lastAt: r.createdAt.toISOString(),
          count: 1,
          open: false,
        });
      } else {
        cur.lastText = r.text;
        cur.lastDirection = dir;
        cur.lastAt = r.createdAt.toISOString();
        cur.count++;
      }
    }
    const list = [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    // Solo la conversación más reciente puede seguir abierta: lo está mientras
    // no tenga el marcador de cierre por inactividad.
    if (list[0]) list[0].open = lastStatus.get(list[0].id) !== DANA_CLOSED_STATUS;
    return list;
  }

  /**
   * Envía el mensaje del alumno a n8n. Si n8n responde síncronamente con texto,
   * se guarda como OUT y se devuelve; si no, la respuesta llegará por el
   * webhook receptor y el cliente la verá al refrescar.
   */
  async send(
    tenantId: string,
    userId: string,
    mensaje: string,
    opts: { newConversation?: boolean } = {},
  ) {
    if (!this.config) {
      throw new NotFoundException({ message: 'Dana no está configurada.', code: 'DANA_DISABLED' });
    }
    const user = await this.prisma.user.findFirst({
      where: { tenantId, id: userId },
      select: { email: true },
    });
    if (!user)
      throw new NotFoundException({ message: 'Usuario no encontrado.', code: 'USER_NOT_FOUND' });

    const last = await this.prisma.modDanaMessage.findFirst({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      select: { conversationId: true, createdAt: true, status: true },
    });
    const conversationId = resolveConversationId(
      last
        ? {
            conversationId: last.conversationId,
            createdAt: last.createdAt,
            closed: last.status === DANA_CLOSED_STATUS,
          }
        : null,
      new Date(),
      // Se puede retomar el mismo hilo hasta el cierre por inactividad (2 ventanas).
      2 * this.config.conversationTtlMs,
      randomUUID,
      opts.newConversation === true,
    );

    const inbound = await this.prisma.modDanaMessage.create({
      data: {
        tenantId,
        userId,
        conversationId,
        direction: 'IN',
        text: mensaje.trim().slice(0, 4000),
        status: 'SENT',
      },
    });

    const payload = buildOutboundPayload({
      mensaje,
      correo: user.email,
      conversacionId: conversationId,
      userId,
      tenantId,
      messageId: inbound.id,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let reply: string | null = null;
    try {
      const res = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.secret ? { 'X-Dana-Secret': this.config.secret } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`n8n respondió ${res.status}`);
      const text = await res.text();
      if (text) {
        try {
          reply = parseSyncReply(JSON.parse(text));
        } catch {
          reply = text.trim() ? text.trim().slice(0, 4000) : null;
        }
      }
    } catch (err) {
      await this.prisma.modDanaMessage.update({
        where: { id: inbound.id },
        data: { status: 'FAILED' },
      });
      this.logger.warn(`Dana: fallo enviando a n8n: ${String(err)}`);
      throw new BadGatewayException({
        message: 'No pudimos contactar a Dana. Inténtalo de nuevo en un momento.',
        code: 'DANA_UNAVAILABLE',
      });
    } finally {
      clearTimeout(timer);
    }

    let outbound: DanaMessageView | null = null;
    if (reply) {
      const row = await this.prisma.modDanaMessage.create({
        data: {
          tenantId,
          userId,
          conversationId,
          direction: 'OUT',
          text: reply,
          status: 'RECEIVED',
        },
      });
      outbound = toView(row);
    }
    return { sent: toView(inbound), reply: outbound, conversationId };
  }

  /**
   * Callback de n8n: `{ correo, mensaje, conversacionId? }`. Con conversacionId
   * la respuesta va a esa conversación; si no, se casa con el alumno por correo
   * y se cuelga de su conversación más reciente. Si el mismo correo existe en
   * varios tenants, gana el que tenga el mensaje IN más reciente.
   *
   * Patrón webhook (RLS F3): es un endpoint PÚBLICO sin contexto de tenant y el
   * lookup es legítimamente cross-tenant (correo → usuario → tenant). Bajo el
   * rol de runtime `didacta_app` (NOBYPASSRLS) una consulta sin tenant devuelve
   * 0 filas, así que el lookup corre en `runGlobalWithoutTenant` (bypass
   * sancionado) y la escritura del OUT en `runAsTenant(tenant destino)` para que
   * pase el WITH CHECK de RLS.
   */
  async receive(msg: InboundMessage): Promise<{ ok: boolean; userId?: string }> {
    const target = await runGlobalWithoutTenant(async () => {
      if (msg.conversacionId) {
        const byConv = await this.prisma.modDanaMessage.findFirst({
          where: { conversationId: msg.conversacionId },
          select: { userId: true, tenantId: true, conversationId: true },
        });
        if (byConv)
          return {
            id: byConv.userId,
            tenantId: byConv.tenantId,
            conversationId: byConv.conversationId,
          };
      }
      const users = await this.prisma.user.findMany({
        where: { email: { equals: msg.correo, mode: 'insensitive' } },
        select: { id: true, tenantId: true },
      });
      if (users.length === 0) return null;
      const latest = await this.prisma.modDanaMessage.findFirst({
        where: { userId: { in: users.map((u) => u.id) }, direction: 'IN' },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, tenantId: true, conversationId: true },
      });
      return latest
        ? { id: latest.userId, tenantId: latest.tenantId, conversationId: latest.conversationId }
        : { id: users[0]!.id, tenantId: users[0]!.tenantId, conversationId: null };
    });

    if (!target) {
      this.logger.warn(`Dana: callback para correo desconocido ${msg.correo}`);
      return { ok: false };
    }

    await runAsTenant(
      target.tenantId,
      () =>
        this.prisma.modDanaMessage.create({
          data: {
            tenantId: target.tenantId,
            userId: target.id,
            conversationId: target.conversationId,
            direction: 'OUT',
            text: msg.mensaje,
            status: 'RECEIVED',
          },
        }),
      { userId: target.id, traceLabel: 'dana-callback' },
    );
    return { ok: true, userId: target.id };
  }

  /**
   * Barrido de inactividad (lo dispara el worker periódico). Por cada
   * conversación reciente, según su último mensaje: si lleva una ventana en
   * silencio, Dana pregunta "¿sigues ahí?"; si tras otra ventana sigue sin
   * respuesta, se cierra por inactividad. Ambos son mensajes OUT de sistema.
   */
  async sweepInactive(now: Date = new Date()): Promise<{ nudged: number; closed: number }> {
    if (!this.config) return { nudged: 0, closed: 0 };
    const ttlMs = this.config.conversationTtlMs;
    // Solo miramos conversaciones con actividad razonablemente reciente: una
    // idle desde hace horas ya está cerrada por el propio cálculo de `open`.
    const windowStart = new Date(now.getTime() - 6 * ttlMs);

    const targets = await runGlobalWithoutTenant(async () => {
      const rows = await this.prisma.modDanaMessage.findMany({
        where: { conversationId: { not: null }, createdAt: { gt: windowStart } },
        orderBy: { createdAt: 'desc' },
        select: {
          conversationId: true,
          tenantId: true,
          userId: true,
          status: true,
          createdAt: true,
        },
        take: 2000,
      });
      const seen = new Set<string>();
      const out: Array<{
        conversationId: string;
        tenantId: string;
        userId: string;
        action: 'nudge' | 'close';
      }> = [];
      for (const r of rows) {
        const id = r.conversationId!;
        if (seen.has(id)) continue; // la primera vez que vemos el id es su ÚLTIMO mensaje
        seen.add(id);
        const action = decideInactivityAction(
          { status: r.status, createdAt: r.createdAt },
          now,
          ttlMs,
        );
        if (action)
          out.push({ conversationId: id, tenantId: r.tenantId, userId: r.userId, action });
      }
      return out;
    });

    let nudged = 0;
    let closed = 0;
    for (const t of targets) {
      try {
        await runAsTenant(
          t.tenantId,
          () =>
            this.prisma.modDanaMessage.create({
              data: {
                tenantId: t.tenantId,
                userId: t.userId,
                conversationId: t.conversationId,
                direction: 'OUT',
                text: t.action === 'nudge' ? DANA_NUDGE_TEXT : DANA_CLOSED_TEXT,
                status: t.action === 'nudge' ? DANA_NUDGE_STATUS : DANA_CLOSED_STATUS,
              },
            }),
          { userId: t.userId, traceLabel: 'dana-sweep' },
        );
        if (t.action === 'nudge') nudged++;
        else closed++;
      } catch (err) {
        this.logger.warn(`Dana sweep: no se pudo ${t.action} ${t.conversationId}: ${String(err)}`);
      }
    }
    if (nudged || closed) this.logger.log(`Dana sweep: ${nudged} avisos, ${closed} cierres`);
    return { nudged, closed };
  }
}

function toView(r: {
  id: string;
  conversationId: string | null;
  direction: string;
  text: string;
  status: string;
  createdAt: Date;
}): DanaMessageView {
  return {
    id: r.id,
    conversationId: r.conversationId,
    direction: r.direction === 'OUT' ? 'OUT' : 'IN',
    text: r.text,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}
