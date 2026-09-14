/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@didacta/database';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleRegistryService } from '../module-registry.service';
import { parseActionConfig, type RetoActionType } from './action-catalog';
import type { CreateActionDto, CreateRetoDto, UpdateActionDto, UpdateRetoDto } from './dto';

/** Forma del fichero de seed (`seeds/bienvenido.json`). */
export interface RetoSeedFile {
  courseSlug: string;
  moduleKey: string;
  retos: RetoSeed[];
}
export interface RetoSeed {
  key: string;
  position: number;
  title: string;
  points: number;
  badge: { key: string; label: string; emoji?: string };
  /** Fragmento del título de la lección VIDEO del curso (case/acentos-insensible). */
  lessonTitleContains: string;
  completionMessage?: string;
  quiz: {
    title: string;
    passThreshold: number;
    showFeedback: boolean;
    questions: Array<{
      type: 'SINGLE_CHOICE';
      prompt: string;
      options: Array<{ label: string; isCorrect: boolean }>;
      feedback?: string;
      feedbackIncorrect?: string;
    }>;
  };
  actions: Array<{
    key: string;
    type: RetoActionType;
    title: string;
    description?: string;
    required: boolean;
    config: Record<string, unknown>;
  }>;
}

export interface ImportRetoResult {
  key: string;
  retoId: string;
  action: 'created' | 'updated';
  lessonId: string | null;
  quizId: string | null;
  quizCreated: boolean;
  questionsCreated: number;
  actions: number;
}

/**
 * Retos de Dropi Academy (docs/retos/plan-retos.md). CRUD administrable de la
 * definición (reto + acciones) y la importación idempotente del seed del
 * módulo Bienvenido. El motor de completitud (Fase B) lee estas tablas.
 *
 * Vive en el host: compone mod.courses (lección) y mod.assessments (quiz) por
 * IDs lógicos, sin FKs cross-módulo.
 */
@Injectable()
export class RetosService {
  private readonly logger = new Logger(RetosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
  ) {}

  // ─── Retos ────────────────────────────────────────────────────────────

  listRetos(tenantId: string, moduleKey?: string) {
    return this.prisma.modRetosReto.findMany({
      where: { tenantId, ...(moduleKey ? { moduleKey } : {}) },
      orderBy: [{ moduleKey: 'asc' }, { position: 'asc' }],
      include: { actions: { orderBy: { position: 'asc' } } },
    });
  }

  async getReto(tenantId: string, id: string) {
    const reto = await this.prisma.modRetosReto.findFirst({
      where: { tenantId, id },
      include: { actions: { orderBy: { position: 'asc' } } },
    });
    if (!reto)
      throw new NotFoundException({ message: 'Reto no encontrado.', code: 'RETO_NOT_FOUND' });
    return reto;
  }

  async getRetoByLesson(tenantId: string, lessonId: string) {
    return this.prisma.modRetosReto.findFirst({
      where: { tenantId, lessonId },
      include: { actions: { orderBy: { position: 'asc' } } },
    });
  }

  async createReto(tenantId: string, dto: CreateRetoDto) {
    await this.assertKeyFree(tenantId, dto.key);
    // Los obligatorios van explícitos: `retoData` (pensado para update) los
    // deja opcionales y Prisma los exige al crear.
    return this.prisma.modRetosReto.create({
      data: {
        tenantId,
        key: dto.key,
        title: dto.title,
        position: dto.position,
        moduleKey: dto.moduleKey,
        points: dto.points,
        status: dto.status,
        description: dto.description ?? null,
        lessonId: dto.lessonId ?? null,
        quizId: dto.quizId ?? null,
        badgeKey: dto.badge?.key ?? null,
        badgeLabel: dto.badge?.label ?? null,
        badgeEmoji: dto.badge?.emoji ?? null,
        completionMessage: dto.completionMessage ?? null,
      },
      include: { actions: true },
    });
  }

  async updateReto(tenantId: string, id: string, dto: UpdateRetoDto) {
    await this.getReto(tenantId, id);
    if (dto.key) await this.assertKeyFree(tenantId, dto.key, id);
    return this.prisma.modRetosReto.update({
      where: { id },
      data: this.retoData(dto),
      include: { actions: { orderBy: { position: 'asc' } } },
    });
  }

  async deleteReto(tenantId: string, id: string) {
    await this.getReto(tenantId, id);
    await this.prisma.modRetosReto.delete({ where: { id } });
  }

  // ─── Acciones ─────────────────────────────────────────────────────────

  async addAction(tenantId: string, retoId: string, dto: CreateActionDto) {
    const reto = await this.getReto(tenantId, retoId);
    if (reto.actions.some((a) => a.key === dto.key)) {
      throw new BadRequestException({
        message: `Ya existe una acción con clave "${dto.key}" en este reto.`,
        code: 'RETO_ACTION_KEY_TAKEN',
      });
    }
    const config = this.parseConfig(dto.type, dto.config);
    const position = (reto.actions.at(-1)?.position ?? 0) + 1;
    return this.prisma.modRetosAction.create({
      data: {
        tenantId,
        retoId,
        key: dto.key,
        type: dto.type,
        title: dto.title,
        description: dto.description ?? null,
        required: dto.required,
        config: config as Prisma.InputJsonValue,
        position,
      },
    });
  }

  async updateAction(tenantId: string, retoId: string, actionId: string, dto: UpdateActionDto) {
    const action = await this.getAction(tenantId, retoId, actionId);
    const type = (dto.type ?? action.type) as RetoActionType;
    // Si cambia el tipo o la config, se revalida contra el esquema del tipo.
    const config =
      dto.config !== undefined || dto.type !== undefined
        ? this.parseConfig(type, dto.config ?? (action.config as Record<string, unknown>))
        : undefined;
    return this.prisma.modRetosAction.update({
      where: { id: actionId },
      data: {
        ...(dto.key !== undefined ? { key: dto.key } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.required !== undefined ? { required: dto.required } : {}),
        ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async deleteAction(tenantId: string, retoId: string, actionId: string) {
    await this.getAction(tenantId, retoId, actionId);
    await this.prisma.modRetosAction.delete({ where: { id: actionId } });
  }

  async reorderActions(tenantId: string, retoId: string, actionIds: string[]) {
    const reto = await this.getReto(tenantId, retoId);
    const known = new Set(reto.actions.map((a) => a.id));
    if (actionIds.length !== known.size || actionIds.some((id) => !known.has(id))) {
      throw new BadRequestException({
        message: 'La lista debe contener exactamente las acciones del reto.',
        code: 'RETO_ACTIONS_REORDER_MISMATCH',
      });
    }
    await this.prisma.$transaction(
      actionIds.map((id, i) =>
        this.prisma.modRetosAction.update({ where: { id }, data: { position: i + 1 } }),
      ),
    );
    return this.getReto(tenantId, retoId);
  }

  // ─── Seed / import ────────────────────────────────────────────────────

  /**
   * Importa (crea o actualiza) los retos del seed. Idempotente por `key`:
   * re-importar no duplica retos ni quizzes (el quiz solo se crea si el reto
   * aún no tiene uno). Resuelve la lección por fragmento de título dentro del
   * curso indicado por slug.
   */
  async importSeed(tenantId: string, actorId: string | null, seed: RetoSeedFile) {
    const course = await this.prisma.modCoursesCourse.findFirst({
      where: { tenantId, slug: seed.courseSlug, deletedAt: null },
      select: { id: true },
    });
    if (!course) {
      throw new NotFoundException({
        message: `No existe el curso con slug "${seed.courseSlug}".`,
        code: 'RETOS_SEED_COURSE_NOT_FOUND',
      });
    }
    const detail = await this.registry.getCoursesService().getCourseDetail(tenantId, course.id);
    const lessons = detail.modules.flatMap((m) =>
      m.lessons.map((l) => ({ id: l.id, title: l.title, type: l.type })),
    );
    const assessments = this.registry.getAssessmentsService();
    const results: ImportRetoResult[] = [];

    for (const r of seed.retos) {
      const lesson = lessons.find(
        (l) => l.type === 'VIDEO' && normalize(l.title).includes(normalize(r.lessonTitleContains)),
      );
      if (!lesson) {
        this.logger.warn(
          `Seed reto ${r.key}: no hay lección VIDEO cuyo título contenga "${r.lessonTitleContains}".`,
        );
      }

      const existing = await this.prisma.modRetosReto.findFirst({
        where: { tenantId, key: r.key },
        include: { actions: true },
      });

      // Quiz: solo se crea si el reto no tiene uno todavía.
      let quizId = existing?.quizId ?? null;
      let quizCreated = false;
      let questionsCreated = 0;
      if (!quizId) {
        const quiz = await assessments.createQuiz(tenantId, actorId, {
          lessonId: lesson?.id,
          title: r.quiz.title,
          passThreshold: r.quiz.passThreshold,
          showFeedback: r.quiz.showFeedback,
          // maxAttempts omitido = intentos ilimitados (sin penalización).
        });
        quizId = quiz.id;
        quizCreated = true;
        for (const q of r.quiz.questions) {
          await assessments.addQuestion(tenantId, quiz.id, {
            type: q.type,
            prompt: q.prompt,
            options: q.options,
            feedback: q.feedback,
            feedbackIncorrect: q.feedbackIncorrect,
          });
          questionsCreated++;
        }
        await assessments.publishQuiz(tenantId, actorId, quiz.id);
      }

      const data = {
        title: r.title,
        moduleKey: seed.moduleKey,
        position: r.position,
        lessonId: lesson?.id ?? existing?.lessonId ?? null,
        quizId,
        points: r.points,
        badgeKey: r.badge.key,
        badgeLabel: r.badge.label,
        badgeEmoji: r.badge.emoji ?? null,
        completionMessage: r.completionMessage ?? null,
        status: 'PUBLISHED',
      };
      const reto = existing
        ? await this.prisma.modRetosReto.update({ where: { id: existing.id }, data })
        : await this.prisma.modRetosReto.create({ data: { tenantId, key: r.key, ...data } });

      // Acciones: upsert por clave, respetando el orden del seed.
      let pos = 0;
      for (const a of r.actions) {
        pos++;
        const config = this.parseConfig(a.type, a.config) as Prisma.InputJsonValue;
        const prev = existing?.actions.find((x) => x.key === a.key);
        const actionData = {
          type: a.type,
          title: a.title,
          description: a.description ?? null,
          required: a.required,
          config,
          position: pos,
        };
        if (prev) {
          await this.prisma.modRetosAction.update({ where: { id: prev.id }, data: actionData });
        } else {
          await this.prisma.modRetosAction.create({
            data: { tenantId, retoId: reto.id, key: a.key, ...actionData },
          });
        }
      }

      results.push({
        key: r.key,
        retoId: reto.id,
        action: existing ? 'updated' : 'created',
        lessonId: data.lessonId,
        quizId,
        quizCreated,
        questionsCreated,
        actions: r.actions.length,
      });
    }

    return {
      courseId: course.id,
      total: results.length,
      created: results.filter((x) => x.action === 'created').length,
      updated: results.filter((x) => x.action === 'updated').length,
      withoutLesson: results.filter((x) => !x.lessonId).length,
      results,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private retoData(dto: UpdateRetoDto) {
    return {
      ...(dto.key !== undefined ? { key: dto.key } : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
      ...(dto.moduleKey !== undefined ? { moduleKey: dto.moduleKey } : {}),
      ...(dto.position !== undefined ? { position: dto.position } : {}),
      ...(dto.lessonId !== undefined ? { lessonId: dto.lessonId } : {}),
      ...(dto.quizId !== undefined ? { quizId: dto.quizId } : {}),
      ...(dto.points !== undefined ? { points: dto.points } : {}),
      ...(dto.badge !== undefined
        ? {
            badgeKey: dto.badge?.key ?? null,
            badgeLabel: dto.badge?.label ?? null,
            badgeEmoji: dto.badge?.emoji ?? null,
          }
        : {}),
      ...(dto.completionMessage !== undefined ? { completionMessage: dto.completionMessage } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
  }

  private async assertKeyFree(tenantId: string, key: string, exceptId?: string) {
    const clash = await this.prisma.modRetosReto.findFirst({
      where: { tenantId, key, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException({
        message: `Ya existe un reto con clave "${key}".`,
        code: 'RETO_KEY_TAKEN',
      });
    }
  }

  private async getAction(tenantId: string, retoId: string, actionId: string) {
    const action = await this.prisma.modRetosAction.findFirst({
      where: { tenantId, retoId, id: actionId },
    });
    if (!action) {
      throw new NotFoundException({
        message: 'Acción no encontrada.',
        code: 'RETO_ACTION_NOT_FOUND',
      });
    }
    return action;
  }

  private parseConfig(type: RetoActionType, config: unknown) {
    try {
      return parseActionConfig(type, config);
    } catch (err) {
      throw new BadRequestException({
        message: `Configuración inválida para la acción ${type}: ${err instanceof Error ? err.message : String(err)}`,
        code: 'RETO_ACTION_CONFIG_INVALID',
      });
    }
  }
}

/** Minúsculas y sin acentos, para casar títulos de lección con el seed. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
