/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { requiredSubmissions, type RetoActionType } from './action-catalog';

/**
 * Cálculo PURO del progreso de un reto para un alumno (docs/retos/plan-retos.md
 * §3.3). Un reto tiene pasos IMPLÍCITOS (ver el video al 100 % si tiene
 * lección; aprobar el quiz si tiene quiz) más las acciones del catálogo.
 *
 *   % del reto = pasos requeridos hechos ÷ pasos requeridos.
 *   completo   = todos los pasos requeridos hechos (y hay al menos uno).
 *
 * Las acciones opcionales (required=false, p.ej. "mi primer pedido") se
 * muestran pero no entran en el %. Las acciones con varias entregas (Reto 3:
 * 2 capturas) se dan por hechas cuando `count >= needed` ("1 de 2").
 */

/** Claves reservadas de los pasos implícitos. */
export const STEP_VIDEO = 'video';
export const STEP_QUIZ = 'quiz';

export type StepType = 'VIDEO' | 'QUIZ' | RetoActionType;

export interface RetoDefinitionLike {
  lessonId: string | null;
  quizId: string | null;
  actions: Array<{
    key: string;
    type: string;
    title: string;
    required: boolean;
    config: unknown;
  }>;
}

export interface DoneRowLike {
  actionKey: string;
  count: number;
}

export interface StepProgress {
  key: string;
  type: StepType;
  /** Vacío para los implícitos: la web pone la etiqueta traducida. */
  title: string;
  required: boolean;
  done: boolean;
  /** Entregas aprobadas / necesarias (1/1 en pasos simples). */
  count: number;
  needed: number;
}

export interface RetoProgress {
  steps: StepProgress[];
  requiredTotal: number;
  requiredDone: number;
  percent: number;
  complete: boolean;
}

export function computeRetoProgress(reto: RetoDefinitionLike, done: DoneRowLike[]): RetoProgress {
  const countOf = (key: string) => done.find((d) => d.actionKey === key)?.count ?? 0;
  const steps: StepProgress[] = [];

  if (reto.lessonId) {
    const c = countOf(STEP_VIDEO);
    steps.push({
      key: STEP_VIDEO,
      type: 'VIDEO',
      title: '',
      required: true,
      done: c >= 1,
      count: Math.min(c, 1),
      needed: 1,
    });
  }
  if (reto.quizId) {
    const c = countOf(STEP_QUIZ);
    steps.push({
      key: STEP_QUIZ,
      type: 'QUIZ',
      title: '',
      required: true,
      done: c >= 1,
      count: Math.min(c, 1),
      needed: 1,
    });
  }
  for (const a of reto.actions) {
    const type = a.type as RetoActionType;
    const needed = requiredSubmissions(type, (a.config ?? {}) as Record<string, unknown>);
    const c = countOf(a.key);
    steps.push({
      key: a.key,
      type,
      title: a.title,
      required: a.required,
      done: c >= needed,
      count: Math.min(c, needed),
      needed,
    });
  }

  const required = steps.filter((s) => s.required);
  const requiredDone = required.filter((s) => s.done).length;
  const percent = required.length ? Math.round((100 * requiredDone) / required.length) : 0;
  return {
    steps,
    requiredTotal: required.length,
    requiredDone,
    percent,
    complete: required.length > 0 && requiredDone === required.length,
  };
}

/** % del módulo = media de los % de sus retos (0 si no hay retos). */
export function computeModulePercent(percents: number[]): number {
  if (percents.length === 0) return 0;
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
}
