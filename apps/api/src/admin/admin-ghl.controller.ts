/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Post,
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

/**
 * Una conexión GHL = una sub-cuenta (location) con su token. Dropi tiene varias
 * (Argentina, Colombia…), así que se guarda una LISTA: al completar un reto se
 * enruta por el `ghlLocationId` del contacto a la cuenta correcta.
 * `locationName`/`verifiedAt` no son secretos pero viven en el blob cifrado por
 * simplicidad (el endpoint descifra para leerlos; el token nunca sale).
 */
interface GhlConnection {
  locationId: string;
  token: string;
  locationName: string | null;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
}

/** Vista pública de una conexión (sin el token). */
interface GhlConnectionDto {
  locationId: string;
  locationName: string | null;
  verifiedAt: string | null;
}

interface GhlListDto {
  connections: GhlConnectionDto[];
}

/** Alta/rotación de una conexión: token + locationId, se verifica al guardar. */
const GhlAddSchema = z.object({
  token: z.string().min(1).max(500),
  locationId: z.string().min(1).max(100),
});

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

function toDto(list: GhlConnection[]): GhlListDto {
  return {
    connections: list.map((c) => ({
      locationId: c.locationId,
      locationName: c.locationName,
      verifiedAt: c.verifiedAt,
    })),
  };
}

/**
 * Endpoints admin para gestionar las conexiones directas con GoHighLevel
 * (Administración → Conexión GHL). Reemplaza el salto por n8n: aquí se guardan
 * los tokens con los que Academy llama a GHL directamente (etiquetas de retos).
 *
 * Almacenamiento: `tenant_setting` scope=`ghl`, key=`connections`, isSecret=true.
 * Array de `GhlConnection` cifrado AES-256-GCM. Migra la clave legada
 * `connection` (una sola) a la lista la primera vez que se lee.
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
  @ApiOperation({ summary: 'Lista las conexiones GHL del tenant (sin los tokens).' })
  async list(@CurrentUser() user: SessionClaims | undefined): Promise<GhlListDto> {
    const claims = requireAdmin(user);
    return toDto(await this.loadConnections(claims.tenantId));
  }

  @Post()
  @ApiOperation({
    summary:
      'Agrega o rota una conexión: verifica el token contra la location en GHL y, si es válido, la guarda con el nombre resuelto. Si la location ya existe, actualiza su token.',
  })
  async add(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(GhlAddSchema)) body: z.infer<typeof GhlAddSchema>,
  ): Promise<GhlListDto & { added: GhlConnectionDto }> {
    const claims = requireAdmin(user);

    // Verificar SIEMPRE al guardar: así solo persistimos tokens que funcionan y
    // guardamos el nombre que resuelve GHL (lo que pidió el usuario).
    let verified: { ok: true; locationName: string | null };
    try {
      verified = await this.ghl.verifyToken(body.token, body.locationId);
    } catch (err) {
      const detail = err instanceof GhlApiError ? err.detail : (err as Error).message;
      throw new ForbiddenException({
        message: `GHL rechazó el token: ${detail}`,
        code: 'ADMIN_GHL_TOKEN_REJECTED',
        detail,
      });
    }

    const entry: GhlConnection = {
      locationId: body.locationId,
      token: body.token,
      locationName: verified.locationName,
      verifiedAt: new Date().toISOString(),
      verifiedByUserId: claims.sub,
    };

    const list = await this.loadConnections(claims.tenantId);
    const idx = list.findIndex((c) => c.locationId === entry.locationId);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);

    await this.saveConnections(claims.tenantId, list, claims.sub);
    return {
      ...toDto(list),
      added: {
        locationId: entry.locationId,
        locationName: entry.locationName,
        verifiedAt: entry.verifiedAt,
      },
    };
  }

  @Delete(':locationId')
  @ApiOperation({ summary: 'Elimina una conexión por su locationId.' })
  async remove(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('locationId') locationId: string,
  ): Promise<GhlListDto> {
    const claims = requireAdmin(user);
    const list = await this.loadConnections(claims.tenantId);
    const next = list.filter((c) => c.locationId !== locationId);
    await this.saveConnections(claims.tenantId, next, claims.sub);
    return toDto(next);
  }

  // ─── Persistencia ──────────────────────────────────────────────────────

  private async loadConnections(tenantId: string): Promise<GhlConnection[]> {
    const config = this.modules.getTenantConfig();
    let list: GhlConnection[] | undefined;
    try {
      list = (await config.get(tenantId, 'ghl', 'connections')) as GhlConnection[] | undefined;
    } catch (err) {
      this.logger.warn(
        `[admin-ghl] decrypt falló leyendo connections del tenant ${tenantId}: ${(err as Error).message.slice(0, 200)}`,
      );
      list = undefined;
    }
    if (Array.isArray(list)) return list;

    // Migración de la clave legada `connection` (una sola conexión) a la lista.
    const legacy = await this.readLegacy(tenantId);
    if (legacy) {
      await this.saveConnections(tenantId, [legacy], legacy.verifiedByUserId).catch(
        () => undefined,
      );
      return [legacy];
    }
    return [];
  }

  private async readLegacy(tenantId: string): Promise<GhlConnection | null> {
    const config = this.modules.getTenantConfig();
    let secret: { token?: string; locationId?: string } | undefined;
    try {
      secret = (await config.get(tenantId, 'ghl', 'connection')) as
        | { token?: string; locationId?: string }
        | undefined;
    } catch {
      secret = undefined;
    }
    if (!secret?.token || !secret.locationId) return null;
    const meta =
      ((await config.get(tenantId, 'ghl', 'connection_meta').catch(() => undefined)) as
        | {
            verifiedAt?: string | null;
            verifiedByUserId?: string | null;
            locationName?: string | null;
          }
        | undefined) ?? {};
    return {
      locationId: secret.locationId,
      token: secret.token,
      locationName: meta.locationName ?? null,
      verifiedAt: meta.verifiedAt ?? null,
      verifiedByUserId: meta.verifiedByUserId ?? null,
    };
  }

  private async saveConnections(
    tenantId: string,
    list: GhlConnection[],
    actorId: string | null,
  ): Promise<void> {
    await this.modules
      .getTenantConfig()
      .set(tenantId, 'ghl', 'connections', list, { isSecret: true, actorId });
  }
}
