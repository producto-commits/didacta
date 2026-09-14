/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ModulesModule } from '../modules.module';
import { MeRetosController } from './me-retos.controller';
import { RetosAdminController } from './retos-admin.controller';
import { RetosEngineService } from './retos-engine.service';
import { RetosEventsBridge } from './retos-events.bridge';
import { RetosService } from './retos.service';

/// Retos de Dropi Academy (docs/retos/plan-retos.md).
/// Fase A: definición administrable (reto + acciones del catálogo) e import.
/// Fase B: motor de completitud (video + quiz + acciones → 100 % → puntos e
/// insignia) y API del alumno.
/// Convención sub-módulo (ADR-011): forwardRef recíproco con ModulesModule.
@Module({
  imports: [AuthModule, forwardRef(() => ModulesModule)],
  controllers: [RetosAdminController, MeRetosController],
  providers: [RetosService, RetosEngineService, RetosEventsBridge],
  exports: [RetosService, RetosEngineService],
})
export class RetosModule {}
