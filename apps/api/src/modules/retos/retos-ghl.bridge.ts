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
  locationId?: string;
  token?: string;
}

/**
 * Reto completado → etiqueta DIRECTA en GoHighLevel (sin n8n).
 *
 * Corre alongside el bridge de webhooks: mientras validamos el camino directo,
 * `retos.reto.completed` sigue emitiéndose y n8n puede seguir escuchándolo. Una
 * vez confiemos en esto, se borra el endpoint de n8n para retos.
 *
 * Enrutado multi-cuenta: el tenant guarda VARIAS conexiones (una por sub-cuenta
 * de GHL). Se elige la que coincide con el `ghlLocationId` del contacto; si el
 * contacto no trae location y hay una sola conexión, se usa esa.
 *
 * La etiqueta es el `reto.key` verbatim (slug estable y único por tenant, p.ej.
 * `bienvenido-1`): el equipo dispara sus workflows de GHL sobre esa etiqueta.
 *
 * Best-effort en todo: si el usuario no tiene `ghlContactId` (no vino por
 * `/inscribe`), si no hay conexión aplicable, o si GHL falla, se registra y se
 * sigue — nunca se deshace la completitud del reto.
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
    // 1) Conexiones GHL del tenant (tokens cifrados).
    const connections = await this.loadConnections(tenantId);
    if (connections.length === 0) {
      this.logger.debug(`GHL sin configurar en ${tenantId}: reto ${data.retoKey} no etiquetado.`);
      return;
    }

    // 2) Identidad GHL del alumno. Sólo la tienen quienes vinieron por /inscribe.
    const user = await this.prisma.user.findFirst({
      where: { id: data.userId, tenantId },
      select: { ghlContactId: true, ghlLocationId: true },
    });
    if (!user?.ghlContactId) {
      this.logger.debug(
        `Usuario ${data.userId} sin ghlContactId: reto ${data.retoKey} no etiquetado.`,
      );
      return;
    }

    // 3) Elegir la conexión: por locationId del contacto; si no trae y hay una
    //    sola, esa. Con varias y sin location, no adivinamos.
    const conn = this.pickConnection(connections, user.ghlLocationId);
    if (!conn?.token) {
      this.logger.warn(
        `GHL: sin conexión aplicable para el contacto ${user.ghlContactId} ` +
          `(location ${user.ghlLocationId ?? 'null'}, ${connections.length} conexiones): reto ${data.retoKey} no etiquetado.`,
      );
      return;
    }

    // 4) Etiqueta = `<códigoCurso>-<retoKey>` si el curso tiene código GHL; si
    //    no, solo el key del reto. El código lo fija el formador en el editor
    //    del curso (columna ghl_tag), para que la etiqueta sea corta y diga de
    //    qué curso es (ej. `24h-arg-bienvenido-1`).
    const retoKey = data.retoKey.trim();
    if (!retoKey) return;
    const courseCode = await this.resolveCourseCode(tenantId, data.courseId);
    const tag = courseCode ? `${courseCode}-${retoKey}` : retoKey;

    await this.ghl.addContactTags(conn.token, user.ghlContactId, [tag]);
    this.logger.log(
      `GHL: etiqueta "${tag}" aplicada al contacto ${user.ghlContactId} en location ${conn.locationId}.`,
    );
  }

  /** Código GHL del curso (columna ghl_tag), o null si no tiene o no se resuelve. */
  private async resolveCourseCode(
    tenantId: string,
    courseId: string | null,
  ): Promise<string | null> {
    if (!courseId) return null;
    const course = await this.prisma.modCoursesCourse.findFirst({
      where: { id: courseId, tenantId },
      select: { ghlTag: true },
    });
    const code = course?.ghlTag?.trim();
    return code ? code : null;
  }

  private pickConnection(
    connections: GhlConnection[],
    locationId: string | null,
  ): GhlConnection | undefined {
    if (locationId) return connections.find((c) => c.locationId === locationId);
    if (connections.length === 1) return connections[0];
    return undefined;
  }

  /** Lee la lista de conexiones; cae a la clave legada `connection` (una sola). */
  private async loadConnections(tenantId: string): Promise<GhlConnection[]> {
    try {
      const list = (await this.config.get(tenantId, 'ghl', 'connections')) as
        | GhlConnection[]
        | undefined;
      if (Array.isArray(list)) return list;
      const legacy = (await this.config.get(tenantId, 'ghl', 'connection')) as
        | GhlConnection
        | undefined;
      return legacy?.token ? [legacy] : [];
    } catch (err) {
      this.logger.warn(
        `GHL: no se pudieron leer las conexiones del tenant ${tenantId}: ${(err as Error).message.slice(0, 200)}`,
      );
      return [];
    }
  }
}
