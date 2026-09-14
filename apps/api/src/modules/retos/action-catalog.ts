/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { z } from 'zod';

/**
 * Catálogo de tipos de acción de un reto (Dropi Academy, ver
 * docs/retos/plan-retos.md §3.2). El admin arma un reto eligiendo acciones de
 * aquí; cada tipo tiene su validador (quién la da por hecha) y su `config`.
 *
 * Video y quiz NO son acciones del catálogo: son implícitas del reto cuando
 * tiene `lessonId` / `quizId` (el motor las exige igual para el 100 %).
 *
 * Módulo PURO: solo esquemas y helpers sin IO, para poder testearlo.
 */
export const RETO_ACTION_TYPES = [
  /** Pregunta de perfil de selección única (Reto 1). Captura un dato. */
  'PROFILE_QUESTION',
  /** El alumno sube capturas; la IA con visión las valida/analiza (Retos 2 y 3). */
  'AI_ANALYZE_IMAGE',
  /** Al menos una consulta al tutor / Dana. */
  'AI_CHAT_CONSULT',
  /** El alumno confirma que lo hizo (respaldo sin automatización). */
  'SELF_CONFIRM',
  /** Validación por BD de Dropi (retos futuros; no la usa el MVP). */
  'DB_ORDER_CREATED',
  'DB_ORDER_DELIVERED',
] as const;

export type RetoActionType = (typeof RETO_ACTION_TYPES)[number];

export const retoActionTypeSchema = z.enum(RETO_ACTION_TYPES);

/** Insignia de PERFIL que otorga una acción al validarse (🧠 → ⚡ Activado). */
const profileBadgeSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  emoji: z.string().trim().max(16).optional(),
});

const profileQuestionConfig = z.object({
  /** Clave estable de la pregunta en `mod_profile_answer` (p.ej. `situacion-actual`). */
  questionKey: z.string().trim().min(1).max(64),
  prompt: z.string().trim().min(3).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
});

const aiAnalyzeImageConfig = z.object({
  /** Pasos que el asistente muestra al alumno ("Ve al catálogo, elige…"). */
  steps: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  /** Nº de capturas requeridas, validadas por separado (Reto 3: 2 → "1 de 2"). */
  submissions: z.number().int().min(1).max(5).default(1),
  /** Qué debe verificar la IA en cada captura. */
  prompt: z.string().trim().min(10).max(4000),
  /**
   * `analysis`: la IA responde con recomendaciones (Reto 2: ángulo de venta,
   * público, cómo comunicar el valor). `fixed`: la IA solo valida y la
   * plataforma muestra `fixedMessage` (Reto 3).
   */
  feedbackMode: z.enum(['analysis', 'fixed']).default('analysis'),
  fixedMessage: z.string().trim().max(2000).optional(),
  /** Si se define, al validarse cambia la insignia de perfil (acción 4 del Reto 2). */
  grantsProfileBadge: profileBadgeSchema.optional(),
});

const aiChatConsultConfig = z.object({
  prompt: z.string().trim().max(2000).optional(),
});

const selfConfirmConfig = z.object({
  instructions: z.string().trim().min(3).max(2000),
});

const dbConfig = z.object({}).passthrough();

/** Esquema de `config` por tipo. */
export const RETO_ACTION_CONFIG_SCHEMAS: Record<RetoActionType, z.ZodTypeAny> = {
  PROFILE_QUESTION: profileQuestionConfig,
  AI_ANALYZE_IMAGE: aiAnalyzeImageConfig,
  AI_CHAT_CONSULT: aiChatConsultConfig,
  SELF_CONFIRM: selfConfirmConfig,
  DB_ORDER_CREATED: dbConfig,
  DB_ORDER_DELIVERED: dbConfig,
};

export type ProfileQuestionConfig = z.infer<typeof profileQuestionConfig>;
export type AiAnalyzeImageConfig = z.infer<typeof aiAnalyzeImageConfig>;

/**
 * Valida y normaliza la `config` de una acción según su tipo. Lanza ZodError
 * si no cumple (el controller lo convierte en 400). Aplica los defaults
 * (`submissions: 1`, `feedbackMode: 'analysis'`).
 */
export function parseActionConfig(type: RetoActionType, config: unknown): Record<string, unknown> {
  const schema = RETO_ACTION_CONFIG_SCHEMAS[type];
  const parsed = schema.parse(config ?? {}) as Record<string, unknown>;
  if (type === 'AI_ANALYZE_IMAGE') {
    const c = parsed as AiAnalyzeImageConfig;
    if (c.feedbackMode === 'fixed' && !c.fixedMessage?.trim()) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ['fixedMessage'],
          message: 'feedbackMode "fixed" exige fixedMessage',
        },
      ]);
    }
  }
  return parsed;
}

/** ¿El tipo requiere que el alumno entregue capturas? (para la UI del asistente). */
export function actionNeedsUpload(type: RetoActionType): boolean {
  return type === 'AI_ANALYZE_IMAGE';
}

/**
 * Nº de entregas que hacen falta para dar la acción por hecha (Reto 3: 2).
 * Para tipos sin entregas múltiples es 1.
 */
export function requiredSubmissions(type: RetoActionType, config: Record<string, unknown>): number {
  if (type !== 'AI_ANALYZE_IMAGE') return 1;
  const n = Number((config as { submissions?: unknown }).submissions ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Claves y etiquetas del catálogo para pintar el selector del admin. Las
 * etiquetas visibles se traducen en la web; aquí solo la clave y si sube
 * archivos.
 */
export function listActionTypes(): Array<{ type: RetoActionType; needsUpload: boolean }> {
  return RETO_ACTION_TYPES.map((type) => ({ type, needsUpload: actionNeedsUpload(type) }));
}
