/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { DanaInactivityWorker } from './dana-inactivity.worker';
import { DanaWebhookController, MeDanaController } from './dana.controllers';
import { DanaService } from './dana.service';

/// "Hablar con Dana": relé con el agente n8n de Dropi Academy (Fase E/F).
/// Env: DANA_WEBHOOK_URL (obligatoria para activarlo), DANA_WEBHOOK_SECRET,
/// DANA_TIMEOUT_MS, DANA_CONVERSATION_TTL_MINUTES (inactividad, 30 por defecto),
/// DANA_SWEEP_CRON (cada cuánto corre el barrido de inactividad).
@Module({
  imports: [AuthModule],
  controllers: [MeDanaController, DanaWebhookController],
  providers: [DanaService, DanaInactivityWorker],
  exports: [DanaService],
})
export class DanaModule {}
