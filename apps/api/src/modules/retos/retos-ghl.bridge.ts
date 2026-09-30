/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GhlClientService } from '../../integrations/ghl/ghl-client.service';
import { ModuleContextFactory } from '../module-context.factory';
import { PrismaTenantConfigService } from '../prisma-tenant-config.service';

interface RetoCompletedPayload {
  retoId: string;
  retoKey: string;
  retoTitle: string;
  userId: string;
  courseId: string | null;
  courseName: string | null;
}

interface GhlConnection {
  token?: string;
  locationId?: string;
}

/**
 * Reto completado → etiqueta DIRECTA en GoHighLevel (sin n8n).
 *
 * Corre alongside el bridge de webhooks: mientras validamos el camino directo,
 * `retos.reto.completed` sigue emitiéndose y n8n puede seguir escuchándolo. Una
 * vez confiemos en esto, se borra el endpoint de n8n para retos.
 *
 * La etiqueta es el `reto.key` verbatim (slug estable y único por tenant, p.ej.
 * `bienvenido-1`): el equipo dispara sus workflows de GHL sobre esa etiqueta.
 *
 * Best-effort en todo: si el usuario no tiene `ghlContactId` (no vino por
 * `/inscribe`), si el tenant no tiene conexión GHL, o si GHL falla, se registra
 * y se sigue — nunca se deshace la completitud del reto.
 */
@Injectable()
export class RetosGhlBridge implements OnModuleInit {
  private readonly logger = new Logger(RetosGhlBridge.name);

  constructor(
    private readonly factory: ModuleContextFactory,
    private readonly prisma: PrismaService,
    private readonly config: PrismaTenantConfigService,
    private readonly ghl: GhlClientService,
  ) {}

  onModuleInit(): void {
    this.factory
      .getEventBus()
      .subscribe<RetoCompletedPayload>('retos.reto.completed', async (event) => {
        const tenantId = event.metadata.tenantId;
        if (!tenantId) return;
        try {
          await this.applyTag(tenantId, event.data);
        } catch (err) {
          this.logger.warn(`GHL: fallo aplicando etiqueta de reto: ${String(err)}`);
        }
      });
    this.logger.log('Retos → GHL: suscrito a retos.reto.completed (etiquetas directas)');
  }

  private async applyTag(tenantId: string, data: RetoCompletedPayload): Promise<void> {
    // 1) Conexión GHL del tenant (token cifrado). Sin token → nada que hacer.
    let connection: GhlConnection | undefined;
    try {
      connection = (await this.config.get(tenantId, 'ghl', 'connection')) as
        | GhlConnection
        | undefined;
    } catch (err) {
      this.logger.warn(
        `GHL: no se pudo leer la conexión del tenant ${tenantId}: ${(err as Error).message.slice(0, 200)}`,
      );
      return;
    }
    if (!connection?.token) {
      this.logger.debug(`GHL sin configurar en ${tenantId}: reto ${data.retoKey} no etiquetado.`);
      return;
    }

    // 2) Identidad GHL del alumno. Sólo la tienen quienes vinieron por /inscribe.
    const user = await this.prisma.user.findFirst({
      where: { id: data.userId, tenantId },
      select: { ghlContactId: true },
    });
    if (!user?.ghlContactId) {
      this.logger.debug(
        `Usuario ${data.userId} sin ghlContactId: reto ${data.retoKey} no etiquetado.`,
      );
      return;
    }

    // 3) Etiqueta = el key del reto (estable, único por tenant).
    const tag = data.retoKey.trim();
    if (!tag) return;

    await this.ghl.addContactTags(connection.token, user.ghlContactId, [tag]);
    this.logger.log(
      `GHL: etiqueta "${tag}" aplicada al contacto ${user.ghlContactId} (reto completado).`,
    );
  }
}
