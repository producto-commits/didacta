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
  /** Orden del reto dentro de su módulo (1..n) → parte "reto-N" de la etiqueta. */
  position?: number | null;
  userId: string;
  courseId: string | null;
  courseName: string | null;
}

interface CourseCompletedPayload {
  enrollmentId: string;
  courseId: string;
  courseName: string | null;
  userId: string;
}

interface GhlConnection {
  locationId?: string;
  token?: string;
}

/** Contacto GHL resuelto + la conexión (token) por la que hay que etiquetarlo. */
interface GhlTarget {
  token: string;
  contactId: string;
  locationId?: string;
}

/**
 * Eventos de aprendizaje → etiquetas DIRECTAS en GoHighLevel (sin n8n).
 *
 * Dos disparadores:
 *  - `retos.reto.completed` → `<códigoCurso>-reto-<posición>` (ej. `24h-arg-reto-1`).
 *  - `learning.course.completed` → `Completo_curso_<códigoCurso>` (ej.
 *    `Completo_curso_24h-arg`).
 *
 * El código del curso lo fija el formador en el editor (columna `ghl_tag`); si
 * no hay código, cae al slug del curso. Enrutado multi-cuenta: el tenant guarda
 * VARIAS conexiones (una por sub-cuenta); se elige la que coincide con el
 * `ghlLocationId` del contacto (si no trae y hay una sola, esa).
 *
 * Corre alongside el bridge de webhooks: los eventos se siguen emitiendo y n8n
 * puede seguir escuchándolos hasta que confiemos en el camino directo.
 *
 * Best-effort en todo: si el usuario no tiene `ghlContactId` (no vino por
 * `/inscribe`), si no hay conexión aplicable, o si GHL falla, se registra y se
 * sigue — nunca se deshace la completitud.
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
    const bus = this.factory.getEventBus();

    bus.subscribe<RetoCompletedPayload>('retos.reto.completed', async (event) => {
      const tenantId = event.metadata.tenantId;
      if (!tenantId) return;
      try {
        await this.applyRetoTag(tenantId, event.data);
      } catch (err) {
        this.logger.warn(`GHL: fallo aplicando etiqueta de reto: ${String(err)}`);
      }
    });

    bus.subscribe<CourseCompletedPayload>('learning.course.completed', async (event) => {
      const tenantId = event.metadata.tenantId;
      if (!tenantId) return;
      try {
        await this.applyCourseTag(tenantId, event.data);
      } catch (err) {
        this.logger.warn(`GHL: fallo aplicando etiqueta de curso: ${String(err)}`);
      }
    });

    this.logger.log(
      'GHL: suscrito a retos.reto.completed y learning.course.completed (etiquetas directas)',
    );
  }

  // ─── Reto completado → `<código>-reto-<posición>` ───────────────────────

  private async applyRetoTag(tenantId: string, data: RetoCompletedPayload): Promise<void> {
    const target = await this.resolveTarget(tenantId, data.userId);
    if (!target) {
      this.logger.debug(`GHL: reto ${data.retoKey} no etiquetado (sin conexión o sin contacto).`);
      return;
    }
    // La parte del reto es su ORDEN dentro del módulo (reto-1, reto-2…), no la
    // clave interna. Si no hay posición, cae a la clave.
    const retoPart =
      typeof data.position === 'number' && data.position > 0
        ? `reto-${data.position}`
        : data.retoKey.trim();
    if (!retoPart) return;
    const { code } = await this.resolveCourse(tenantId, data.courseId);
    const tag = code ? `${code}-${retoPart}` : retoPart;
    await this.tag(target, tag);
  }

  // ─── Curso completado → `Completo_curso_<código>` ───────────────────────

  private async applyCourseTag(tenantId: string, data: CourseCompletedPayload): Promise<void> {
    const target = await this.resolveTarget(tenantId, data.userId);
    if (!target) {
      this.logger.debug(`GHL: curso ${data.courseId} no etiquetado (sin conexión o sin contacto).`);
      return;
    }
    // Formato pedido por el equipo: `Completo_curso_<código>`. Sin código GHL,
    // cae al slug del curso (siempre existe) para no perder la etiqueta.
    const { code, slug } = await this.resolveCourse(tenantId, data.courseId);
    const id = code ?? slug;
    if (!id) return;
    await this.tag(target, `Completo_curso_${id}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async tag(target: GhlTarget, tag: string): Promise<void> {
    await this.ghl.addContactTags(target.token, target.contactId, [tag]);
    this.logger.log(
      `GHL: etiqueta "${tag}" aplicada al contacto ${target.contactId} en location ${target.locationId}.`,
    );
  }

  /** Conexión + contacto GHL del alumno, o null si falta algo (best-effort). */
  private async resolveTarget(tenantId: string, userId: string): Promise<GhlTarget | null> {
    const connections = await this.loadConnections(tenantId);
    if (connections.length === 0) return null;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { ghlContactId: true, ghlLocationId: true },
    });
    if (!user?.ghlContactId) return null;

    const conn = this.pickConnection(connections, user.ghlLocationId);
    if (!conn?.token) {
      this.logger.warn(
        `GHL: sin conexión aplicable para el contacto ${user.ghlContactId} ` +
          `(location ${user.ghlLocationId ?? 'null'}, ${connections.length} conexiones).`,
      );
      return null;
    }
    return { token: conn.token, contactId: user.ghlContactId, locationId: conn.locationId };
  }

  /** Código GHL (columna ghl_tag) y slug del curso, para componer la etiqueta. */
  private async resolveCourse(
    tenantId: string,
    courseId: string | null,
  ): Promise<{ code: string | null; slug: string | null }> {
    if (!courseId) return { code: null, slug: null };
    const course = await this.prisma.modCoursesCourse.findFirst({
      where: { id: courseId, tenantId },
      select: { ghlTag: true, slug: true },
    });
    const code = course?.ghlTag?.trim();
    return { code: code ? code : null, slug: course?.slug ?? null };
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
