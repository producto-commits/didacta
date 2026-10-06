/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GhlApiError, GhlClientService } from '../integrations/ghl/ghl-client.service';
import { MetaCapiService } from '../integrations/meta/meta-capi.service';
import { PrismaAuditLogService } from '../modules/prisma-audit-log.service';
import { PrismaTenantConfigService } from '../modules/prisma-tenant-config.service';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { runAsTenant } from '../tenancy/tenant-context.storage';
import type { ClientContext } from './client-context';
import type { RegistroDto } from './dto';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';

const NO_CTX: ClientContext = { ip: null, userAgent: null };
const DEFAULT_ALUMNO_ROLE = 'alumno';
/** El enlace "define tu contraseña" del email debe durar días, no 1h. */
const SET_PASSWORD_TTL_MINUTES = 60 * 24 * 7;
/**
 * Etiquetas que recibe el contacto al registrarse por el link. Disparan el
 * mensaje M1 ("registrate en Dropi") en los workflows de GHL.
 */
const REGISTRO_TAGS = ['registrado_dropi_academy', 'academy_argentina'];
/** Curso en el que se matricula al alumno al registrarse por el link. */
const REGISTRO_COURSE_SLUG = 'vende-en-24h-con-dropi';

interface GhlConnection {
  locationId?: string;
  token?: string;
  locationName?: string | null;
}

/**
 * Registro público por el LINK de captación (`POST /auth/registro`).
 *
 * A diferencia de `signup` (email+contraseña, cerrado por defecto), este flujo:
 *  - Es la puerta de captación: siempre abierto, sin contraseña en el form.
 *  - Crea el alumno ACTIVE y le envía un email con enlace para FIJAR contraseña
 *    (ese enlace es su entrada — NO auto-login, que con solo-email sería tomable).
 *  - Crea/actualiza el contacto en GHL (dedupe por correo/teléfono) en la
 *    sub-cuenta de Argentina y le aplica las etiquetas que disparan el M1.
 *
 * Todo lo de GHL es best-effort: un fallo de GHL no impide el registro ni el
 * email de entrada.
 */
@Injectable()
export class RegistroService {
  private readonly logger = new Logger(RegistroService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly passwordReset: PasswordResetService,
    private readonly auditLog: PrismaAuditLogService,
    private readonly config: PrismaTenantConfigService,
    private readonly ghl: GhlClientService,
    private readonly registry: ModuleRegistryService,
    private readonly metaCapi: MetaCapiService,
  ) {}

  async register(
    tenantId: string | undefined,
    dto: RegistroDto,
    webBaseUrl: string,
    ctx: ClientContext = NO_CTX,
  ): Promise<{ ok: true; fbEventId: string }> {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'No se pudo resolver la academia para este registro.',
        code: 'REGISTRO_TENANT_NOT_RESOLVED',
      });
    }
    const name = `${dto.firstName} ${dto.lastName}`.replace(/\s+/g, ' ').trim();
    const phone = normalizePhone(dto.phone);
    // ID de evento COMPARTIDO con el pixel del navegador: Meta deduplica el
    // CompleteRegistration (server + cliente) por este `eventID`.
    const fbEventId = randomUUID();

    // Endpoint PÚBLICO (sin middleware de tenant): abrimos el contexto RLS del
    // tenant resuelto por host, si no el `user.create` / lectura de tenant_setting
    // violan la policy (42501). Mismo patrón que `signup`.
    await runAsTenant(
      tenantId,
      async () => {
        const { userId, created } = await this.findOrCreateUser(tenantId, dto.email, name);

        // 0) Matricular en el curso de Academy (idempotente, best-effort): sin
        //    esto el alumno entra pero no ve el curso ni sus retos.
        await this.enrollInCourse(tenantId, userId, dto.email);

        // 1) GHL: crear/actualizar el contacto en Argentina + etiquetas (best-effort).
        try {
          await this.syncGhlContact(tenantId, userId, {
            email: dto.email,
            phone,
            firstName: dto.firstName,
            lastName: dto.lastName,
          });
        } catch (err) {
          const detail = err instanceof GhlApiError ? err.detail : String(err);
          this.logger.warn(`registro: fallo creando contacto en GHL (${dto.email}): ${detail}`);
        }

        // 2) Meta Conversions API (server-side): CompleteRegistration con el
        //    mismo event_id que el pixel del navegador. Best-effort.
        await this.sendMetaCapiRegistration(tenantId, fbEventId, webBaseUrl, {
          email: dto.email,
          phone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          clientIp: ctx.ip,
          userAgent: ctx.userAgent,
        });

        await this.auditLog.record({
          tenantId,
          actorId: userId,
          action: 'auth.registro',
          resourceType: 'user',
          resourceId: userId,
          metadata: { email: dto.email, created },
          ip: ctx.ip ?? undefined,
          userAgent: ctx.userAgent ?? undefined,
        });
      },
      { traceLabel: 'registro' },
    );

    // 2) Email con enlace para fijar contraseña (copy de invitación/bienvenida).
    //    Se envía SIEMPRE (nuevo o existente) — es la puerta de entrada. Se
    //    auto-escopa al tenant por dentro (anti-enumeración incluido).
    await this.passwordReset.requestAndSendEmail(
      { email: dto.email, resolvedTenantId: tenantId },
      webBaseUrl,
      ctx,
      { allowPending: true, ttlMinutes: SET_PASSWORD_TTL_MINUTES, asInvitation: true },
    );

    return { ok: true, fbEventId };
  }

  /**
   * Dispara CompleteRegistration por la Conversions API de Meta si el tenant
   * tiene Pixel ID (marketing/facebook_pixel) y token CAPI
   * (marketing/facebook_capi_token). Best-effort: cualquier fallo se traga.
   */
  private async sendMetaCapiRegistration(
    tenantId: string,
    eventId: string,
    webBaseUrl: string,
    user: {
      email: string;
      phone: string | null;
      firstName: string;
      lastName: string;
      clientIp: string | null;
      userAgent: string | null;
    },
  ): Promise<void> {
    try {
      const pixel = (await this.config
        .get(tenantId, 'marketing', 'facebook_pixel')
        .catch(() => undefined)) as { pixelId?: string } | undefined;
      const capi = (await this.config
        .get(tenantId, 'marketing', 'facebook_capi_token')
        .catch(() => undefined)) as { token?: string } | undefined;
      if (!pixel?.pixelId || !capi?.token) return;

      await this.metaCapi.sendEvent({
        pixelId: pixel.pixelId,
        token: capi.token,
        eventId,
        eventName: 'CompleteRegistration',
        eventSourceUrl: `${webBaseUrl.replace(/\/$/, '')}/registro`,
        user,
      });
    } catch (err) {
      this.logger.warn(
        `registro: Meta CAPI best-effort falló: ${(err as Error).message.slice(0, 200)}`,
      );
    }
  }

  /** Crea el alumno ACTIVE sin contraseña usable (define la suya por el email). */
  private async findOrCreateUser(
    tenantId: string,
    email: string,
    name: string,
  ): Promise<{ userId: string; created: boolean }> {
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { id: true },
    });
    if (existing) return { userId: existing.id, created: false };

    const passwordHash = await this.passwords.hash(randomBytes(16).toString('base64url'));
    const role = await this.prisma.role.findUnique({ where: { name: DEFAULT_ALUMNO_ROLE } });

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            tenantId,
            email,
            name,
            status: 'ACTIVE',
            passwordHash,
            mustChangePassword: false,
            // Origen = link público → habilita la misión de bienvenida "Regístrate
            // en Dropi" (los de inscribe/GHL no la ven).
            registrationSource: 'self_registro',
          },
        });
        if (role) await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
        return created;
      });
      return { userId: user.id, created: true };
    } catch (err) {
      // Carrera: dos registros del mismo email a la vez → P2002. Releemos.
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const again = await this.prisma.user.findUnique({
        where: { tenantId_email: { tenantId, email } },
        select: { id: true },
      });
      if (!again) throw err;
      return { userId: again.id, created: false };
    }
  }

  /** Matricula al alumno en el curso del link (idempotente, best-effort). */
  private async enrollInCourse(tenantId: string, userId: string, email: string): Promise<void> {
    try {
      const course = await this.prisma.modCoursesCourse.findUnique({
        where: { tenantId_slug: { tenantId, slug: REGISTRO_COURSE_SLUG } },
        select: { id: true },
      });
      if (!course) {
        this.logger.warn(
          `registro: curso "${REGISTRO_COURSE_SLUG}" no existe en ${tenantId} — ${email} sin matrícula.`,
        );
        return;
      }
      await this.registry.getLearningService().enrollFromApi(tenantId, userId, course.id);
      this.logger.log(`registro: ${email} matriculado en ${REGISTRO_COURSE_SLUG}.`);
    } catch (err) {
      // AlreadyEnrolled / COURSE_NOT_PUBLISHED / otro: no rompe el registro.
      this.logger.warn(
        `registro: matrícula de ${email} en ${REGISTRO_COURSE_SLUG}: ${String(err)}`,
      );
    }
  }

  /** Upsert del contacto en la sub-cuenta de Argentina + etiquetas. */
  private async syncGhlContact(
    tenantId: string,
    userId: string,
    input: { email: string; phone: string | null; firstName: string; lastName: string },
  ): Promise<void> {
    const conn = await this.resolveArgentinaConnection(tenantId);
    if (!conn?.token || !conn.locationId) {
      this.logger.warn(
        `registro: sin conexión GHL de Argentina en ${tenantId} — contacto no creado.`,
      );
      return;
    }

    const { contactId } = await this.ghl.upsertContact(conn.token, {
      locationId: conn.locationId,
      email: input.email,
      ...(input.phone ? { phone: input.phone } : {}),
      firstName: input.firstName,
      lastName: input.lastName,
    });
    if (!contactId) {
      this.logger.warn(`registro: GHL no devolvió contactId para ${input.email}.`);
      return;
    }

    // Guardar la identidad GHL en el usuario (mismas columnas que /inscribe), para
    // que luego las etiquetas de retos/curso se enruten solas.
    await this.prisma.user.update({
      where: { id: userId },
      data: { ghlContactId: contactId, ghlLocationId: conn.locationId },
    });

    await this.ghl.addContactTags(conn.token, contactId, REGISTRO_TAGS);
    this.logger.log(
      `registro: contacto ${contactId} creado/actualizado en Argentina + etiquetas M1.`,
    );
  }

  /**
   * Elige la conexión GHL de Argentina: por `locationName` que contenga
   * "argentina"; si no, si hay una sola conexión, esa.
   */
  private async resolveArgentinaConnection(tenantId: string): Promise<GhlConnection | undefined> {
    let list: GhlConnection[] | undefined;
    try {
      list = (await this.config.get(tenantId, 'ghl', 'connections')) as GhlConnection[] | undefined;
      if (!Array.isArray(list)) {
        const legacy = (await this.config.get(tenantId, 'ghl', 'connection')) as
          | GhlConnection
          | undefined;
        list = legacy?.token ? [legacy] : [];
      }
    } catch (err) {
      this.logger.warn(
        `registro: no se pudieron leer las conexiones GHL de ${tenantId}: ${(err as Error).message.slice(0, 200)}`,
      );
      return undefined;
    }
    const arg = list.find((c) => /argentina/i.test(c.locationName ?? ''));
    if (arg) return arg;
    return list.length === 1 ? list[0] : undefined;
  }
}

/** Normaliza el teléfono a `+<dígitos>` (quita espacios/guiones); null si vacío. */
function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/[\s-]/g, '');
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`;
}
