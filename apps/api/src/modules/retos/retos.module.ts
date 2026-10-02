/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { forwardRef, Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { AuthModule } from '../../auth/auth.module';
import { GhlModule } from '../../integrations/ghl/ghl.module';
import { GhlInboundController } from '../../integrations/ghl/ghl-inbound.controller';
import { ModulesModule } from '../modules.module';
import { MeRetosController } from './me-retos.controller';
import { RetosAdminController } from './retos-admin.controller';
import { RetosEngineService } from './retos-engine.service';
import { RetosEventsBridge } from './retos-events.bridge';
import { RetosGhlBridge } from './retos-ghl.bridge';
import { RetosService } from './retos.service';
import { RetosSubmissionsService } from './retos-submissions.service';

/// Retos de Dropi Academy (docs/retos/plan-retos.md).
/// Fase A: definición administrable (reto + acciones del catálogo) e import.
/// Fase B: motor de completitud (video + quiz + acciones → 100 % → puntos e
/// insignia) y API del alumno.
/// Fase C: entregas de capturas validadas por IA de visión ("Reportar un reto").
/// Convención sub-módulo (ADR-011): forwardRef recíproco con ModulesModule.
@Module({
  imports: [AuthModule, AiModule, GhlModule, forwardRef(() => ModulesModule)],
  controllers: [RetosAdminController, MeRetosController, GhlInboundController],
  providers: [
    RetosService,
    RetosEngineService,
    RetosEventsBridge,
    RetosGhlBridge,
    RetosSubmissionsService,
  ],
  exports: [RetosService, RetosEngineService],
})
export class RetosModule {}
