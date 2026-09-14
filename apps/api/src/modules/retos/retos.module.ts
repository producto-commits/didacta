/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ModulesModule } from '../modules.module';
import { RetosAdminController } from './retos-admin.controller';
import { RetosService } from './retos.service';

/// Retos de Dropi Academy (docs/retos/plan-retos.md). Fase A: definición
/// administrable (reto + acciones del catálogo) e importación del seed.
/// Convención sub-módulo (ADR-011): forwardRef recíproco con ModulesModule.
@Module({
  imports: [AuthModule, forwardRef(() => ModulesModule)],
  controllers: [RetosAdminController],
  providers: [RetosService],
  exports: [RetosService],
})
export class RetosModule {}
