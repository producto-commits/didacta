/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildOutboundPayload,
  danaConfigFromEnv,
  parseSyncReply,
  type DanaConfig,
  type InboundMessage,
} from './dana-protocol';

export interface DanaMessageView {
  id: string;
  direction: 'IN' | 'OUT';
  text: string;
  status: string;
  createdAt: string;
}

/**
 * "Hablar con Dana" (docs/retos/plan-retos.md §3.5, Fase E): relé entre el
 * alumno y el agente n8n de Dropi Academy. Guarda cada mensaje (IN/OUT) para
 * pintar el hilo y para poder casar la respuesta asíncrona de n8n con el
 * alumno correcto (n8n solo devuelve `{ correo, mensaje }`).
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

  async list(tenantId: string, userId: string, sinceIso?: string): Promise<DanaMessageView[]> {
    const since = sinceIso ? new Date(sinceIso) : null;
    const rows = await this.prisma.modDanaMessage.findMany({
      where: {
        tenantId,
        userId,
        ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map(toView);
  }

  /**
   * Envía el mensaje del alumno a n8n. Si n8n responde síncronamente con texto,
   * se guarda como OUT y se devuelve; si no, la respuesta llegará por el
   * webhook receptor y el cliente la verá al refrescar.
   */
  async send(tenantId: string, userId: string, mensaje: string) {
    if (!this.config) {
      throw new NotFoundException({ message: 'Dana no está configurada.', code: 'DANA_DISABLED' });
    }
    const user = await this.prisma.user.findFirst({
      where: { tenantId, id: userId },
      select: { email: true },
    });
    if (!user)
      throw new NotFoundException({ message: 'Usuario no encontrado.', code: 'USER_NOT_FOUND' });

    const inbound = await this.prisma.modDanaMessage.create({
      data: {
        tenantId,
        userId,
        direction: 'IN',
        text: mensaje.trim().slice(0, 4000),
        status: 'SENT',
      },
    });

    const payload = buildOutboundPayload({
      mensaje,
      correo: user.email,
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
        data: { tenantId, userId, direction: 'OUT', text: reply, status: 'RECEIVED' },
      });
      outbound = toView(row);
    }
    return { sent: toView(inbound), reply: outbound };
  }

  /**
   * Callback de n8n: `{ correo, mensaje }`. Se casa con el alumno por correo;
   * si el mismo correo existe en varios tenants, gana el que tenga el mensaje
   * IN más reciente (es a quien Dana está contestando).
   */
  async receive(msg: InboundMessage): Promise<{ ok: boolean; userId?: string }> {
    const users = await this.prisma.user.findMany({
      where: { email: { equals: msg.correo, mode: 'insensitive' } },
      select: { id: true, tenantId: true },
    });
    if (users.length === 0) {
      this.logger.warn(`Dana: callback para correo desconocido ${msg.correo}`);
      return { ok: false };
    }
    let target = users[0]!;
    if (users.length > 1) {
      const latest = await this.prisma.modDanaMessage.findFirst({
        where: { userId: { in: users.map((u) => u.id) }, direction: 'IN' },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, tenantId: true },
      });
      if (latest) target = { id: latest.userId, tenantId: latest.tenantId };
    }
    await this.prisma.modDanaMessage.create({
      data: {
        tenantId: target.tenantId,
        userId: target.id,
        direction: 'OUT',
        text: msg.mensaje,
        status: 'RECEIVED',
      },
    });
    return { ok: true, userId: target.id };
  }
}

function toView(r: {
  id: string;
  direction: string;
  text: string;
  status: string;
  createdAt: Date;
}): DanaMessageView {
  return {
    id: r.id,
    direction: r.direction === 'OUT' ? 'OUT' : 'IN',
    text: r.text,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}
