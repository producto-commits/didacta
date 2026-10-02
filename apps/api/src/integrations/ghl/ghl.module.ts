/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Module } from '@nestjs/common';
import { GhlClientService } from './ghl-client.service';
import { GhlInboundController } from './ghl-inbound.controller';

/**
 * Integración directa con GoHighLevel (sin n8n). Provee el cliente HTTP (admin +
 * bridge de retos) y el webhook ENTRANTE (`/webhooks/ghl/registrado`) que marca
 * al alumno como registrado en Dropi.
 */
@Module({
  controllers: [GhlInboundController],
  providers: [GhlClientService],
  exports: [GhlClientService],
})
export class GhlModule {}
