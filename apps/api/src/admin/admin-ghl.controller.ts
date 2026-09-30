/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Post,
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
import { GhlClientService, GhlApiError } from '../integrations/ghl/ghl-client.service';
import { ModuleContextFactory } from '../modules/module-context.factory';

const ADMIN_ROLES = new Set(['super_admin', 'tenant_admin']);

/** Credenciales de conexión a GoHighLevel guardadas cifradas para el tenant. */
interface GhlConnection {
  /** API token del tenant (Private Integration Token o access token). */
  token: string;
  /** Sub-cuenta por defecto (location) contra la que se verifica el token. */
  locationId: string;
}

/**
 * Body del PUT. Ambos opcionales: el merge-on-omit conserva lo guardado, así
 * que sólo hace falta re-tipear el token para rotarlo (mismo criterio que la
 * `password` de SMTP y las claves de Stripe).
 */
const GhlUpsertSchema = z.object({
  token: z.string().max(500).optional(),
  locationId: z.string().max(100).optional(),
});

interface GhlResponseDto {
  /** True si hay token guardado (el cleartext nunca sale de la API). */
  hasToken: boolean;
  /** Location por defecto (no es secreto: ayuda al admin a confirmar la cuenta). */
  locationId: string | null;
  /** Nombre de la location de la última verificación exitosa. */
  locationName: string | null;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  /** True si el tenant tiene conexión propia guardada. */
  hasTenantConfig: boolean;
}

function requireAdmin(user: SessionClaims | undefined): SessionClaims {
  if (!user) throw new UnauthorizedException();
  const isAdmin = user.roles.some((r) => ADMIN_ROLES.has(r));
  if (!isAdmin) {
    throw new ForbiddenException({
      message: 'Solo super_admin o tenant_admin pueden gestionar la conexión GHL',
      code: 'ADMIN_GHL_FORBIDDEN',
    });
  }
  return user;
}

/**
 * Endpoints admin para gestionar la conexión directa con GoHighLevel
 * (Administración → Conexión GHL). Reemplaza el salto por n8n: aquí se guarda el
 * token con el que Academy llama a GHL directamente (etiquetas de retos, etc.).
 *
 * Almacenamiento (mismo patrón que AdminSmtpController / AdminStripeController):
 * - Credenciales: `tenant_setting` scope=`ghl`, key=`connection`, isSecret=true.
 *   `{ token, locationId }` cifrado AES-256-GCM por SecretCipherService.
 * - Metadata de verificación: scope=`ghl`, key=`connection_meta`, isSecret=false.
 *   `{ verifiedAt, verifiedByUserId, locationName }`.
 */
@ApiTags('Admin GHL')
@ApiBearerAuth()
@Controller('admin/tenant-settings/ghl')
@UseGuards(JwtAuthGuard)
export class AdminGhlController {
  private readonly logger = new Logger(AdminGhlController.name);

  constructor(
    private readonly modules: ModuleContextFactory,
    private readonly ghl: GhlClientService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Devuelve el estado de la conexión GHL del tenant (nunca el token). hasToken indica si hay credencial guardada.',
  })
  async getCurrent(@CurrentUser() user: SessionClaims | undefined): Promise<GhlResponseDto> {
    const claims = requireAdmin(user);
    return this.readDto(claims.tenantId);
  }

  @Put()
  @ApiOperation({
    summary:
      'Crea o actualiza la conexión GHL del tenant. Reset `verifiedAt`. Token/locationId omitidos o vacíos conservan lo guardado.',
  })
  async upsert(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(GhlUpsertSchema))
    body: z.infer<typeof GhlUpsertSchema>,
  ): Promise<GhlResponseDto> {
    const claims = requireAdmin(user);
    const config = this.modules.getTenantConfig();

    let existing: Partial<GhlConnection> | undefined;
    try {
      existing = (await config.get(claims.tenantId, 'ghl', 'connection')) as
        | Partial<GhlConnection>
        | undefined;
    } catch (err) {
      this.logger.warn(
        `[admin-ghl] no se pudo descifrar la conexión previa del tenant ${claims.tenantId}: ` +
          `${(err as Error).message.slice(0, 200)}. Si el body no trae token se rechaza el update.`,
      );
    }

    const merged: Partial<GhlConnection> = {
      token: nonEmpty(body.token) ?? existing?.token,
      locationId: nonEmpty(body.locationId) ?? existing?.locationId,
    };
    if (!merged.token || !merged.locationId) {
      throw new BadRequestException({
        message:
          'Faltan datos: token y locationId son obligatorios (no hay valores previos guardados para completar lo que falta en el body).',
        code: 'ADMIN_GHL_CREDENTIALS_REQUIRED',
      });
    }

    await config.set(
      claims.tenantId,
      'ghl',
      'connection',
      { token: merged.token, locationId: merged.locationId } satisfies GhlConnection,
      { isSecret: true, actorId: claims.sub },
    );
    // Cualquier cambio invalida la verificación anterior — el admin debe volver
    // a probar la conexión.
    await config.set(
      claims.tenantId,
      'ghl',
      'connection_meta',
      { verifiedAt: null, verifiedByUserId: null, locationName: null },
      { isSecret: false, actorId: claims.sub },
    );

    return this.readDto(claims.tenantId);
  }

  @Post('test')
  @ApiOperation({
    summary:
      'Verifica el token guardado leyendo la location en GHL (solo lectura). Si éxito, marca verifiedAt y guarda el nombre de la cuenta.',
  })
  async test(
    @CurrentUser() user: SessionClaims | undefined,
  ): Promise<{ ok: true; locationName: string | null; verifiedAt: string }> {
    const claims = requireAdmin(user);
    const config = this.modules.getTenantConfig();

    let secret: Partial<GhlConnection> | undefined;
    try {
      secret = (await config.get(claims.tenantId, 'ghl', 'connection')) as
        | Partial<GhlConnection>
        | undefined;
    } catch {
      secret = undefined;
    }
    if (!secret?.token || !secret.locationId) {
      throw new BadRequestException({
        message: 'GHL no configurado para este tenant — guarda el token antes de probar.',
        code: 'ADMIN_GHL_NOT_CONFIGURED',
      });
    }

    let result: { ok: true; locationName: string | null };
    try {
      result = await this.ghl.verifyToken(secret.token, secret.locationId);
    } catch (err) {
      // El error real de GHL (token inválido, scope faltante, location ajena)
      // viaja para que el admin diagnostique — no es secreto. Va en `message`
      // (compat) y en `detail` (lo que enmarca cada idioma), como en Stripe.
      const detail = err instanceof GhlApiError ? err.detail : (err as Error).message;
      throw new BadRequestException({
        message: `GHL rechazó el token: ${detail}`,
        code: 'ADMIN_GHL_TOKEN_REJECTED',
        detail,
      });
    }

    const verifiedAt = new Date().toISOString();
    await config.set(
      claims.tenantId,
      'ghl',
      'connection_meta',
      { verifiedAt, verifiedByUserId: claims.sub, locationName: result.locationName },
      { isSecret: false, actorId: claims.sub },
    );

    return { ok: true, locationName: result.locationName, verifiedAt };
  }

  private async readDto(tenantId: string): Promise<GhlResponseDto> {
    const config = this.modules.getTenantConfig();
    let secret: Partial<GhlConnection> | undefined;
    try {
      secret = (await config.get(tenantId, 'ghl', 'connection')) as
        | Partial<GhlConnection>
        | undefined;
    } catch (err) {
      this.logger.warn(
        `[admin-ghl] decrypt falló leyendo la conexión del tenant ${tenantId}: ${(err as Error).message.slice(0, 200)}`,
      );
      secret = undefined;
    }
    const meta =
      ((await config.get(tenantId, 'ghl', 'connection_meta').catch(() => undefined)) as
        | {
            verifiedAt?: string | null;
            verifiedByUserId?: string | null;
            locationName?: string | null;
          }
        | undefined) ?? {};

    return {
      hasToken: Boolean(secret?.token),
      locationId: secret?.locationId ?? null,
      locationName: meta.locationName ?? null,
      verifiedAt: meta.verifiedAt ?? null,
      verifiedByUserId: meta.verifiedByUserId ?? null,
      hasTenantConfig: Boolean(secret?.token),
    };
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}
