/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Webhook ENTRANTE de GoHighLevel (GHL → Academy, directo, sin n8n).
 *
 * GHL lo llama cuando a un contacto se le añade la etiqueta
 * `registrado_dropi_argentina` (se registró en Dropi). Academy busca al alumno
 * por su `ghlContactId` y completa el reto "Regístrate en Dropi".
 *
 * Público (sin JwtAuthGuard): lo invoca GHL, no un usuario con sesión. Auth por
 * secreto en header `X-Webhook-Secret` cuando `GHL_INBOUND_WEBHOOK_SECRET` está
 * definido; mientras se configura, si no hay secreto en el entorno se acepta sin
 * verificar (y se avisa en logs). Responde 200 SIEMPRE para que GHL no reintente
 * en bucle.
 *
 * FASE 1 (actual): registra el payload para fijar el shape real que manda GHL.
 * La resolución de usuario + completado del reto se añade después, una vez
 * confirmado el formato (y existente el reto).
 */
@ApiTags('GHL Inbound')
@Controller('webhooks/ghl')
export class GhlInboundController {
  private readonly logger = new Logger(GhlInboundController.name);

  @Post('registrado')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Webhook entrante de GHL: contacto registrado en Dropi (etiqueta registrado_dropi_argentina) → completar el reto. Responde 200 siempre.',
  })
  async registrado(
    @Body() body: unknown,
    @Headers('x-webhook-secret') secret?: string,
  ): Promise<{ ok: true }> {
    const expected = process.env['GHL_INBOUND_WEBHOOK_SECRET']?.trim();
    if (expected && secret !== expected) {
      // No revelamos nada: logeamos y respondemos 200 igual (no exponemos que
      // el secreto es inválido ante un llamador no confiable).
      this.logger.warn('ghl-inbound: X-Webhook-Secret inválido o ausente — ignorado.');
      return { ok: true };
    }
    if (!expected) {
      this.logger.warn(
        'ghl-inbound: GHL_INBOUND_WEBHOOK_SECRET no configurado — aceptando sin verificar (fase de configuración).',
      );
    }

    // FASE 1: dejamos constancia del payload COMPLETO para fijar el shape real.
    this.logger.log(`ghl-inbound registrado: ${safeJson(body)}`);
    return { ok: true };
  }
}

/** Serializa el body de forma segura y acotada para el log. */
function safeJson(body: unknown): string {
  try {
    return JSON.stringify(body).slice(0, 2000);
  } catch {
    return String(body).slice(0, 500);
  }
}
