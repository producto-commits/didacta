/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { DanaWebhookController, MeDanaController } from './dana.controllers';
import { DanaService } from './dana.service';

/// "Hablar con Dana": relé con el agente n8n de Dropi Academy (Fase E).
/// Env: DANA_WEBHOOK_URL (obligatoria para activarlo), DANA_WEBHOOK_SECRET,
/// DANA_TIMEOUT_MS.
@Module({
  imports: [AuthModule],
  controllers: [MeDanaController, DanaWebhookController],
  providers: [DanaService],
  exports: [DanaService],
})
export class DanaModule {}
