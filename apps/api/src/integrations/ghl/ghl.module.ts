/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Module } from '@nestjs/common';
import { GhlClientService } from './ghl-client.service';

/**
 * Integración directa con GoHighLevel (sin n8n). Provee el cliente HTTP que
 * consumen el controller admin (`/admin/tenant-settings/ghl`) y el bridge de
 * retos. Sin estado propio → un solo provider exportado.
 */
@Module({
  providers: [GhlClientService],
  exports: [GhlClientService],
})
export class GhlModule {}
