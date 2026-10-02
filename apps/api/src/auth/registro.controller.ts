/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { resolvePublicHost } from '../common/resolve-public-host';
import { TenantResolverService } from '../tenancy/tenant-resolver.service';
import { extractClientContext } from './client-context';
import { registroSchema, type RegistroDto } from './dto';
import { RegistroService } from './registro.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Registro público por el LINK de captación. Vive en `RegistroModule` (no en
 * AuthModule) porque `RegistroService` necesita el ModuleRegistryService
 * (matrícula) — un módulo hoja evita el ciclo Auth↔Modules.
 */
@ApiTags('Auth')
@Controller('auth')
export class RegistroController {
  constructor(
    private readonly tenantResolver: TenantResolverService,
    private readonly registro: RegistroService,
  ) {}

  @Post('registro')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registro público por el link de captación: sin contraseña (correo, nombres, apellidos, teléfono). Crea el alumno, lo matricula en el curso, crea el contacto en GHL (Argentina) y envía email con enlace para fijar contraseña. Responde 200 siempre.',
  })
  async registroPublico(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(registroSchema)) dto: RegistroDto,
  ) {
    const tenant = await this.tenantResolver.resolveByHost(resolvePublicHost(req));
    const webBaseUrl = await this.tenantResolver.resolveTenantWebBaseUrl(tenant?.id ?? null, req);
    return this.registro.register(tenant?.id, dto, webBaseUrl, extractClientContext(req));
  }
}
