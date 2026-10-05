/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SessionClaims } from '../auth/token.service';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { ModuleContextFactory } from '../modules/module-context.factory';

const ADMIN_ROLES = new Set(['super_admin', 'tenant_admin']);

/**
 * Body del PUT. `pixelId` vacío/omitido = borrar el pixel (deja de cargarse).
 * El ID del pixel es público (va en el HTML) → se guarda SIN cifrar.
 */
const FacebookPixelSchema = z.object({
  pixelId: z
    .string()
    .trim()
    .regex(/^[0-9]{6,20}$/, 'El Pixel ID debe ser numérico (6-20 dígitos)')
    .or(z.literal(''))
    .optional(),
});

interface FacebookPixelDto {
  pixelId: string | null;
}

function requireAdmin(user: SessionClaims | undefined): SessionClaims {
  if (!user) throw new UnauthorizedException();
  if (!user.roles.some((r) => ADMIN_ROLES.has(r))) {
    throw new ForbiddenException({
      message: 'Solo super_admin o tenant_admin pueden gestionar el Pixel de Facebook',
      code: 'ADMIN_FB_PIXEL_FORBIDDEN',
    });
  }
  return user;
}

/**
 * Pixel de Facebook per-tenant (Administración → Facebook Pixel). Guarda el
 * Pixel ID (público, sin cifrar) en `tenant_setting` scope=`marketing`
 * key=`facebook_pixel`. La web lo lee por `GET /auth/tenant-context` y carga el
 * pixel (PageView) + dispara `CompleteRegistration` al registrarse.
 */
@ApiTags('Admin Facebook Pixel')
@ApiBearerAuth()
@Controller('admin/tenant-settings/facebook-pixel')
@UseGuards(JwtAuthGuard)
export class AdminFacebookPixelController {
  constructor(private readonly modules: ModuleContextFactory) {}

  @Get()
  @ApiOperation({ summary: 'Devuelve el Pixel ID de Facebook del tenant (o null).' })
  async getCurrent(@CurrentUser() user: SessionClaims | undefined): Promise<FacebookPixelDto> {
    const claims = requireAdmin(user);
    return { pixelId: await this.readPixelId(claims.tenantId) };
  }

  @Put()
  @ApiOperation({ summary: 'Guarda (o borra, si viene vacío) el Pixel ID de Facebook del tenant.' })
  async upsert(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(FacebookPixelSchema)) body: z.infer<typeof FacebookPixelSchema>,
  ): Promise<FacebookPixelDto> {
    const claims = requireAdmin(user);
    const config = this.modules.getTenantConfig();
    const pixelId = body.pixelId?.trim() ?? '';
    if (pixelId) {
      await config.set(
        claims.tenantId,
        'marketing',
        'facebook_pixel',
        { pixelId },
        { isSecret: false, actorId: claims.sub },
      );
    } else {
      await config.delete(claims.tenantId, 'marketing', 'facebook_pixel', { actorId: claims.sub });
    }
    return { pixelId: pixelId || null };
  }

  private async readPixelId(tenantId: string): Promise<string | null> {
    const value = (await this.modules
      .getTenantConfig()
      .get(tenantId, 'marketing', 'facebook_pixel')
      .catch(() => undefined)) as { pixelId?: string } | undefined;
    return value?.pixelId ?? null;
  }
}
