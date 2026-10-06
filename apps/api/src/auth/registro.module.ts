/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Module } from '@nestjs/common';
import { GhlModule } from '../integrations/ghl/ghl.module';
import { MetaCapiService } from '../integrations/meta/meta-capi.service';
import { ModulesModule } from '../modules/modules.module';
import { AuthModule } from './auth.module';
import { RegistroController } from './registro.controller';
import { RegistroService } from './registro.service';

/**
 * Registro público (link de captación). Módulo HOJA: lo importa solo AppModule,
 * así que puede importar AuthModule (PasswordReset/PasswordService/TenantConfig),
 * ModulesModule (ModuleRegistryService → matrícula) y GhlModule (GhlClientService)
 * SIN crear el ciclo Auth↔Modules.
 */
@Module({
  imports: [AuthModule, ModulesModule, GhlModule],
  controllers: [RegistroController],
  providers: [RegistroService, MetaCapiService],
})
export class RegistroModule {}
