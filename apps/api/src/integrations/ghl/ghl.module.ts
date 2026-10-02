/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Module } from '@nestjs/common';
import { GhlClientService } from './ghl-client.service';
import { GhlInboundController } from './ghl-inbound.controller';

/**
 * Integración directa con GoHighLevel (sin n8n). Provee el cliente HTTP que
 * consumen el controller admin (`/admin/tenant-settings/ghl`) y el bridge de
 * retos, y el webhook ENTRANTE (GHL → Academy) de "registrado en Dropi".
 */
@Module({
  controllers: [GhlInboundController],
  providers: [GhlClientService],
  exports: [GhlClientService],
})
export class GhlModule {}
