/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Module } from '@nestjs/common';
import { MetaCapiService } from './meta-capi.service';

/**
 * Integración con Meta (Conversions API). Provee `MetaCapiService`, sin estado y
 * sin dependencias, para disparar eventos server-side (Registro, Ingreso) desde
 * los módulos que los originan (AuthModule, RegistroModule).
 */
@Module({
  providers: [MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaModule {}
