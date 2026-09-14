/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@didacta/database';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleContextFactory } from '../module-context.factory';
import { ModuleRegistryService } from '../module-registry.service';
import type { AiAnalyzeImageConfig, RetoActionType } from './action-catalog';
import {
  computeModulePercent,
  computeRetoProgress,
  STEP_QUIZ,
  STEP_VIDEO,
  type RetoProgress,
} from './retos-progress';

const GAMIFICATION_MODULE = 'mod.gamification';
/** Tipos que el propio alumno puede dar por hechos desde la página del reto. */
const CLIENT_MARKABLE: ReadonlySet<RetoActionType> = new Set([
  'SELF_CONFIRM',
  'PROFILE_QUESTION',
  'AI_CHAT_CONSULT',
]);

export interface RetoView {
  id: string;
  key: string;
  title: string;
  description: string | null;
  moduleKey: string;
  position: number;
  lessonId: string | null;
  quizId: string | null;
  points: number;
  badge: { key: string; label: string; emoji: string | null } | null;
  completionMessage: string | null;
  actions: Array<{
    key: string;
    type: RetoActionType;
    title: string;
    description: string | null;
    required: boolean;
    config: Record<string, unknown>;
  }>;
}

export interface RetoWithProgress {
  reto: RetoView;
  progress: RetoProgress;
  completedAt: string | null;
  awardedAt: string | null;
}

/**
 * Motor de completitud de retos (docs/retos/plan-retos.md §3.3).
 *
 * Recibe "pasos hechos" (video 100 %, quiz aprobado, acción validada), los
 * persiste en `mod_retos_action_done` y recalcula el reto. Al 100 %:
 *   1. marca la LECCIÓN del reto como completada (progreso del curso →
 *      certificado cuando se completen las 5),
 *   2. otorga puntos + insignia UNA sola vez (fila en `mod_retos_completion`
 *      + sourceKey único en gamificación),
 *   3. emite `retos.reto.completed`.
 *
 * El alumno NO completa la lección desde el player: el motor es el único que
 * decide cuándo el reto está al 100 %. Todo lo que no es el propio registro
 * del paso es best-effort (un fallo de puntos no deshace el reto).
 */
@Injectable()
export class RetosEngineService {
  private readonly logger = new Logger(RetosEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
    private readonly factory: ModuleContextFactory,
  ) {}

  // ─── Lectura ──────────────────────────────────────────────────────────

  async listForUser(tenantId: string, userId: string, moduleKey = 'bienvenido') {
    const retos = await this.prisma.modRetosReto.findMany({
      where: { tenantId, moduleKey, status: 'PUBLISHED' },
      orderBy: { position: 'asc' },
      include: { actions: { orderBy: { position: 'asc' } } },
    });
    const ids = retos.map((r) => r.id);
    const [done, completions] = await Promise.all([
      this.prisma.modRetosActionDone.findMany({ where: { tenantId, userId, retoId: { in: ids } } }),
      this.prisma.modRetosCompletion.findMany({ where: { tenantId, userId, retoId: { in: ids } } }),
    ]);
    const items: RetoWithProgress[] = retos.map((r) => {
      const c = completions.find((x) => x.retoId === r.id);
      return {
        reto: toView(r),
        progress: computeRetoProgress(
          r,
          done.filter((d) => d.retoId === r.id),
        ),
        completedAt: c?.completedAt.toISOString() ?? null,
        awardedAt: c?.awardedAt?.toISOString() ?? null,
      };
    });
    return {
      moduleKey,
      modulePercent: computeModulePercent(items.map((i) => i.progress.percent)),
      completedCount: items.filter((i) => i.progress.complete).length,
      retos: items,
    };
  }

  /** Reto de una lección (página del reto) con progreso, % del módulo y el siguiente reto. */
  async getForLesson(tenantId: string, userId: string, lessonId: string) {
    const reto = await this.prisma.modRetosReto.findFirst({
      where: { tenantId, lessonId, status: 'PUBLISHED' },
      select: { id: true, moduleKey: true },
    });
    if (!reto) return null;
    const list = await this.listForUser(tenantId, userId, reto.moduleKey);
    const idx = list.retos.findIndex((r) => r.reto.id === reto.id);
    const current = list.retos[idx]!;
    const next = list.retos[idx + 1] ?? null;
    return {
      ...current,
      modulePercent: list.modulePercent,
      moduleTotal: list.retos.length,
      moduleCompleted: list.completedCount,
      nextReto: next
        ? { id: next.reto.id, title: next.reto.title, lessonId: next.reto.lessonId }
        : null,
    };
  }

  // ─── Pasos hechos ─────────────────────────────────────────────────────

  /** El player reporta que el video llegó al 100 %. */
  async markVideoComplete(tenantId: string, userId: string, retoId: string) {
    const reto = await this.loadReto(tenantId, retoId);
    if (!reto.lessonId) {
      throw new BadRequestException({
        message: 'El reto no tiene lección.',
        code: 'RETO_NO_LESSON',
      });
    }
    await this.upsertDone(tenantId, userId, retoId, STEP_VIDEO, { set: 1 });
    return this.evaluate(tenantId, userId, retoId);
  }

  /** `assessments.attempt.passed` de un quiz que pertenece a un reto. */
  async onQuizPassed(tenantId: string, userId: string, quizId: string) {
    const reto = await this.prisma.modRetosReto.findFirst({
      where: { tenantId, quizId },
      select: { id: true },
    });
    if (!reto) return null;
    await this.upsertDone(tenantId, userId, reto.id, STEP_QUIZ, { set: 1 });
    return this.evaluate(tenantId, userId, reto.id);
  }

  /**
   * El alumno da por hecha una acción desde la página del reto. Solo para los
   * tipos que no requieren validación externa; `AI_ANALYZE_IMAGE` entra por
   * `recordApprovedSubmission` (la valida la IA) y `DB_*` por el cron.
   */
  async markActionDone(
    tenantId: string,
    userId: string,
    retoId: string,
    actionKey: string,
    body: { answer?: string } = {},
  ) {
    const reto = await this.loadReto(tenantId, retoId);
    const action = reto.actions.find((a) => a.key === actionKey);
    if (!action) {
      throw new NotFoundException({
        message: 'Acción no encontrada.',
        code: 'RETO_ACTION_NOT_FOUND',
      });
    }
    const type = action.type as RetoActionType;
    if (!CLIENT_MARKABLE.has(type)) {
      throw new ForbiddenException({
        message: 'Esta acción la valida la plataforma, no se puede marcar a mano.',
        code: 'RETO_ACTION_NOT_SELF_MARKABLE',
      });
    }
    const meta: Record<string, unknown> = {};
    if (type === 'PROFILE_QUESTION') {
      const cfg = action.config as { questionKey?: string; options?: string[] };
      const answer = body.answer?.trim() ?? '';
      if (!answer || !cfg.options?.includes(answer)) {
        throw new BadRequestException({
          message: 'Elige una de las opciones de la pregunta.',
          code: 'RETO_PROFILE_ANSWER_INVALID',
        });
      }
      const questionKey = cfg.questionKey ?? action.key;
      await this.prisma.modProfileAnswer.upsert({
        where: { tenantId_userId_questionKey: { tenantId, userId, questionKey } },
        create: { tenantId, userId, questionKey, value: answer },
        update: { value: answer },
      });
      meta['answer'] = answer;
    }
    await this.upsertDone(tenantId, userId, retoId, actionKey, { set: 1, meta });
    return this.evaluate(tenantId, userId, retoId);
  }

  /**
   * Registra una entrega APROBADA de una acción con capturas (la IA ya la
   * validó, Fase C). Incrementa el contador ("1 de 2") y, si la acción otorga
   * insignia de perfil (acción 4 del Reto 2), la concede al completarse.
   */
  async recordApprovedSubmission(
    tenantId: string,
    userId: string,
    retoId: string,
    actionKey: string,
    meta: Record<string, unknown>,
  ) {
    const reto = await this.loadReto(tenantId, retoId);
    const action = reto.actions.find((a) => a.key === actionKey);
    if (!action || action.type !== 'AI_ANALYZE_IMAGE') {
      throw new NotFoundException({
        message: 'Acción no encontrada.',
        code: 'RETO_ACTION_NOT_FOUND',
      });
    }
    await this.upsertDone(tenantId, userId, retoId, actionKey, { increment: 1, meta });
    const result = await this.evaluate(tenantId, userId, retoId);
    const cfg = action.config as AiAnalyzeImageConfig;
    const step = result.progress.steps.find((s) => s.key === actionKey);
    if (step?.done && cfg.grantsProfileBadge) {
      await this.grantBadgeSafe(tenantId, userId, {
        badgeKey: cfg.grantsProfileBadge.key,
        label: cfg.grantsProfileBadge.label,
        emoji: cfg.grantsProfileBadge.emoji ?? null,
        sourceKey: `retos.action:${userId}:${retoId}:${actionKey}`,
        meta: { retoId, actionKey, profileBadge: true },
      });
    }
    return result;
  }

  // ─── Evaluación ───────────────────────────────────────────────────────

  async evaluate(tenantId: string, userId: string, retoId: string) {
    const reto = await this.loadReto(tenantId, retoId);
    const done = await this.prisma.modRetosActionDone.findMany({
      where: { tenantId, userId, retoId },
    });
    const progress = computeRetoProgress(reto, done);
    if (!progress.complete) return { progress, completed: false, justCompleted: false };

    const where = { tenantId_userId_retoId: { tenantId, userId, retoId } };
    let completion = await this.prisma.modRetosCompletion.findUnique({ where });
    if (completion?.awardedAt) return { progress, completed: true, justCompleted: false };

    const sourceKey = `retos.reto:${userId}:${retoId}`;
    if (!completion) {
      try {
        completion = await this.prisma.modRetosCompletion.create({
          data: { tenantId, userId, retoId, sourceKey },
        });
      } catch {
        // Carrera: otro evento la creó a la vez. Seguimos con la existente.
        completion = await this.prisma.modRetosCompletion.findUnique({ where });
        if (!completion) throw new Error('No se pudo registrar la completitud del reto');
      }
    }

    // 1) La lección del reto queda completada (progreso del curso → certificado).
    if (reto.lessonId) await this.completeLessonSafe(tenantId, userId, reto.lessonId);

    // 2) Puntos + insignia del reto, una sola vez.
    if (reto.points > 0) {
      await this.awardSafe(tenantId, userId, {
        ruleKey: 'retos.reto',
        sourceKey,
        points: reto.points,
        meta: { retoId, retoKey: reto.key },
      });
    }
    if (reto.badgeKey && reto.badgeLabel) {
      await this.grantBadgeSafe(tenantId, userId, {
        badgeKey: reto.badgeKey,
        label: reto.badgeLabel,
        emoji: reto.badgeEmoji,
        sourceKey,
        meta: { retoId, retoKey: reto.key },
      });
    }
    await this.prisma.modRetosCompletion.update({
      where: { id: completion.id },
      data: { awardedAt: new Date() },
    });

    // 3) Evento para quien quiera reaccionar (notificaciones, Dana, etc.).
    await this.publishSafe(tenantId, userId, 'retos.reto.completed', {
      retoId,
      retoKey: reto.key,
      userId,
      points: reto.points,
      badgeKey: reto.badgeKey,
      lessonId: reto.lessonId,
    });

    this.logger.log(`Reto ${reto.key} completado por ${userId} (+${reto.points}).`);
    return { progress, completed: true, justCompleted: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async loadReto(tenantId: string, retoId: string) {
    const reto = await this.prisma.modRetosReto.findFirst({
      where: { tenantId, id: retoId, status: 'PUBLISHED' },
      include: { actions: { orderBy: { position: 'asc' } } },
    });
    if (!reto)
      throw new NotFoundException({ message: 'Reto no encontrado.', code: 'RETO_NOT_FOUND' });
    return reto;
  }

  private async upsertDone(
    tenantId: string,
    userId: string,
    retoId: string,
    actionKey: string,
    opts: { set?: number; increment?: number; meta?: Record<string, unknown> },
  ) {
    const where = { tenantId_userId_retoId_actionKey: { tenantId, userId, retoId, actionKey } };
    const metaJson = opts.meta ? (opts.meta as Prisma.InputJsonValue) : undefined;
    await this.prisma.modRetosActionDone.upsert({
      where,
      create: {
        tenantId,
        userId,
        retoId,
        actionKey,
        count: opts.set ?? opts.increment ?? 1,
        ...(metaJson !== undefined ? { meta: metaJson } : {}),
      },
      update: {
        ...(opts.set !== undefined ? { count: opts.set } : {}),
        ...(opts.increment !== undefined ? { count: { increment: opts.increment } } : {}),
        ...(metaJson !== undefined ? { meta: metaJson } : {}),
      },
    });
  }

  private async completeLessonSafe(tenantId: string, userId: string, lessonId: string) {
    try {
      const lesson = await this.prisma.modCoursesLesson.findFirst({
        where: { tenantId, id: lessonId },
        select: { module: { select: { courseId: true } } },
      });
      if (!lesson) return;
      const enrollment = await this.prisma.modLearningEnrollment.findFirst({
        where: {
          tenantId,
          userId,
          courseId: lesson.module.courseId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
        select: { id: true },
      });
      if (!enrollment) {
        this.logger.warn(
          `Reto completado sin matrícula activa (user ${userId}, lección ${lessonId}).`,
        );
        return;
      }
      await this.registry.getLearningService().trackProgress(tenantId, userId, {
        enrollmentId: enrollment.id,
        lessonId,
        watchedSeconds: 0,
        completed: true,
      });
    } catch (err) {
      this.logger.warn(`No se pudo marcar la lección ${lessonId} completada: ${String(err)}`);
    }
  }

  private async awardSafe(
    tenantId: string,
    userId: string,
    args: { ruleKey: string; sourceKey: string; points: number; meta: Record<string, unknown> },
  ) {
    try {
      if (!(await this.registry.isModuleEnabledForTenant(tenantId, GAMIFICATION_MODULE))) {
        this.logger.warn(`Gamificación desactivada en ${tenantId}: reto sin puntos.`);
        return;
      }
      await this.registry.getGamificationService().award({ tenantId, userId, ...args });
    } catch (err) {
      this.logger.warn(`No se pudieron otorgar puntos (${args.sourceKey}): ${String(err)}`);
    }
  }

  private async grantBadgeSafe(
    tenantId: string,
    userId: string,
    args: {
      badgeKey: string;
      label: string;
      emoji: string | null;
      sourceKey: string;
      meta: Record<string, unknown>;
    },
  ) {
    try {
      if (!(await this.registry.isModuleEnabledForTenant(tenantId, GAMIFICATION_MODULE))) return;
      await this.registry.getGamificationService().grantBadge({ tenantId, userId, ...args });
    } catch (err) {
      this.logger.warn(`No se pudo otorgar la insignia ${args.badgeKey}: ${String(err)}`);
    }
  }

  private async publishSafe(
    tenantId: string,
    userId: string,
    name: string,
    data: Record<string, unknown>,
  ) {
    try {
      await this.factory.getEventBus().publish({
        name,
        version: 1,
        data: data as never,
        metadata: {
          tenantId,
          userId,
          timestamp: new Date().toISOString(),
          traceId: randomUUID(),
          idempotencyKey: `${name}:${String(data['retoId'])}:${userId}`,
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo publicar ${name}: ${String(err)}`);
    }
  }
}

function toView(r: {
  id: string;
  key: string;
  title: string;
  description: string | null;
  moduleKey: string;
  position: number;
  lessonId: string | null;
  quizId: string | null;
  points: number;
  badgeKey: string | null;
  badgeLabel: string | null;
  badgeEmoji: string | null;
  completionMessage: string | null;
  actions: Array<{
    key: string;
    type: string;
    title: string;
    description: string | null;
    required: boolean;
    config: unknown;
  }>;
}): RetoView {
  return {
    id: r.id,
    key: r.key,
    title: r.title,
    description: r.description,
    moduleKey: r.moduleKey,
    position: r.position,
    lessonId: r.lessonId,
    quizId: r.quizId,
    points: r.points,
    badge:
      r.badgeKey && r.badgeLabel
        ? { key: r.badgeKey, label: r.badgeLabel, emoji: r.badgeEmoji }
        : null,
    completionMessage: r.completionMessage,
    actions: r.actions.map((a) => ({
      key: a.key,
      type: a.type as RetoActionType,
      title: a.title,
      description: a.description,
      required: a.required,
      config: (a.config ?? {}) as Record<string, unknown>,
    })),
  };
}
