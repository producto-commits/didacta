/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { runAsTenant, runGlobalWithoutTenant } from '../../tenancy/tenant-context.storage';

/**
 * Webhook ENTRANTE de GoHighLevel (GHL → Academy, directo, sin n8n).
 *
 * GHL lo llama cuando el contacto se registra en Dropi (workflow "Usuario creado
 * en dropi" / etiqueta `registrado_dropi_argentina`). Academy busca al alumno por
 * su `ghlContactId` (= `contact_id` del payload) y marca que YA se registró en
 * Dropi (`dropi_registered_at`) → oculta la misión de bienvenida "Regístrate en
 * Dropi".
 *
 * Público (sin JwtAuthGuard): lo invoca GHL. Auth por secreto en header
 * `X-Webhook-Secret` cuando `GHL_INBOUND_WEBHOOK_SECRET` está definido; mientras
 * se configura, sin secreto se acepta sin verificar (y se avisa). Responde 200
 * SIEMPRE para que GHL no reintente en bucle.
 *
 * RLS (patrón webhook F3): el usuario se resuelve con un lookup GLOBAL sancionado
 * (contact_id → fila → tenantId) y la escritura corre escopada con `runAsTenant`.
 */
@ApiTags('GHL Inbound')
@Controller('webhooks/ghl')
export class GhlInboundController {
  private readonly logger = new Logger(GhlInboundController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post('registrado')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Webhook entrante de GHL: contacto registrado en Dropi → marca dropi_registered_at (oculta la misión). Responde 200 siempre.',
  })
  async registrado(
    @Body() body: unknown,
    @Headers('x-webhook-secret') secret?: string,
  ): Promise<{ ok: true }> {
    const expected = process.env['GHL_INBOUND_WEBHOOK_SECRET']?.trim();
    if (expected && secret !== expected) {
      this.logger.warn('ghl-inbound: X-Webhook-Secret inválido o ausente — ignorado.');
      return { ok: true };
    }
    if (!expected) {
      this.logger.warn(
        'ghl-inbound: GHL_INBOUND_WEBHOOK_SECRET no configurado — aceptando sin verificar (fase de configuración).',
      );
    }

    const { contactId, email } = parseInbound(body);
    this.logger.log(`ghl-inbound registrado: contactId=${contactId ?? '—'} email=${email ?? '—'}`);
    if (!contactId && !email) {
      this.logger.warn('ghl-inbound: payload sin contact_id ni email — nada que hacer.');
      return { ok: true };
    }

    // 1) Lookup GLOBAL (fuera del tenant): contact_id → usuario + su tenant.
    const user = await runGlobalWithoutTenant(() =>
      this.prisma.user.findFirst({
        where: contactId ? { ghlContactId: contactId } : { email: email ?? undefined },
        select: { id: true, tenantId: true, email: true, dropiRegisteredAt: true },
      }),
    );
    if (!user) {
      this.logger.warn(
        `ghl-inbound: sin alumno para contactId=${contactId ?? '—'} email=${email ?? '—'}.`,
      );
      return { ok: true };
    }
    if (user.dropiRegisteredAt) {
      this.logger.log(`ghl-inbound: ${user.email} ya estaba marcado como registrado en Dropi.`);
      return { ok: true };
    }

    // 2) Marcar "registrado en Dropi" ESCOPADO al tenant del alumno.
    try {
      await runAsTenant(
        user.tenantId,
        () =>
          this.prisma.user.update({
            where: { id: user.id },
            data: { dropiRegisteredAt: new Date() },
          }),
        { userId: user.id, traceLabel: 'ghl-inbound' },
      );
      this.logger.log(`ghl-inbound: ${user.email} marcado como registrado en Dropi.`);
    } catch (err) {
      this.logger.warn(`ghl-inbound: fallo marcando a ${user.email}: ${String(err)}`);
    }
    return { ok: true };
  }
}

/** Extrae contactId (contact_id snake / contactId camel) y email del payload de GHL. */
function parseInbound(body: unknown): { contactId: string | null; email: string | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const contactId =
    pickString(b['contact_id']) ??
    pickString(b['contactId']) ??
    pickString((b['contact'] as Record<string, unknown> | undefined)?.['id']);
  const email = pickString(b['email']) ?? pickString(b['contact_email']);
  return { contactId, email: email ? email.toLowerCase() : null };
}

function pickString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
