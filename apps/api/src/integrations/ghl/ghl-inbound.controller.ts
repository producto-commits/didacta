/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RetosEngineService } from '../../modules/retos/retos-engine.service';
import { runAsTenant, runGlobalWithoutTenant } from '../../tenancy/tenant-context.storage';

/** Key del reto que se completa al confirmar el registro en Dropi (seed bienvenido). */
const REGISTRO_RETO_KEY = 'registro-dropi';

/**
 * Webhook ENTRANTE de GoHighLevel (GHL → Academy, directo, sin n8n).
 *
 * GHL lo llama cuando el contacto se registra en Dropi (workflow "Usuario creado
 * en dropi" / etiqueta `registrado_dropi_argentina`). Academy busca al alumno por
 * su `ghlContactId` (= `contact_id` del payload) y completa el reto "Regístrate
 * en Dropi".
 *
 * Público (sin JwtAuthGuard): lo invoca GHL. Auth por secreto en header
 * `X-Webhook-Secret` cuando `GHL_INBOUND_WEBHOOK_SECRET` está definido; mientras
 * se configura, sin secreto en el entorno se acepta sin verificar (y se avisa).
 * Responde 200 SIEMPRE para que GHL no reintente en bucle.
 *
 * RLS (patrón webhook F3, tenant-context.storage): el usuario se resuelve con un
 * lookup GLOBAL sancionado (contact_id → fila → tenantId) y el completado corre
 * escopado con `runAsTenant`.
 */
@ApiTags('GHL Inbound')
@Controller('webhooks/ghl')
export class GhlInboundController {
  private readonly logger = new Logger(GhlInboundController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RetosEngineService,
  ) {}

  @Post('registrado')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Webhook entrante de GHL: contacto registrado en Dropi → completa el reto "Regístrate en Dropi". Responde 200 siempre.',
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
        select: { id: true, tenantId: true, email: true },
      }),
    );
    if (!user) {
      this.logger.warn(
        `ghl-inbound: sin alumno para contactId=${contactId ?? '—'} email=${email ?? '—'} — reto no completado.`,
      );
      return { ok: true };
    }

    // 2) Completar el reto ESCOPADO al tenant del alumno.
    try {
      const res = await runAsTenant(
        user.tenantId,
        () => this.engine.completeRetoByKeyExternal(user.tenantId, user.id, REGISTRO_RETO_KEY),
        { userId: user.id, traceLabel: 'ghl-inbound' },
      );
      this.logger.log(
        `ghl-inbound: reto ${REGISTRO_RETO_KEY} para ${user.email} → found=${res.found} justCompleted=${res.justCompleted}`,
      );
    } catch (err) {
      this.logger.warn(`ghl-inbound: fallo completando el reto para ${user.email}: ${String(err)}`);
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
