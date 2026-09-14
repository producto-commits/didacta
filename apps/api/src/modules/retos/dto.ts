/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { z } from 'zod';
import { retoActionTypeSchema } from './action-catalog';

/** Clave estable: kebab-case, sin espacios. */
const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Usa minúsculas, números y guiones');

const badgeSchema = z
  .object({
    key: keySchema,
    label: z.string().trim().min(1).max(120),
    emoji: z.string().trim().max(16).optional(),
  })
  .nullable();

export const createRetoSchema = z.object({
  key: keySchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  moduleKey: keySchema.default('bienvenido'),
  position: z.number().int().min(1).max(999),
  lessonId: z.string().uuid().nullable().optional(),
  quizId: z.string().uuid().nullable().optional(),
  points: z.number().int().min(0).max(100000).default(0),
  badge: badgeSchema.optional(),
  completionMessage: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});
export type CreateRetoDto = z.infer<typeof createRetoSchema>;

export const updateRetoSchema = createRetoSchema.partial();
export type UpdateRetoDto = z.infer<typeof updateRetoSchema>;

/** `video` y `quiz` son los pasos implícitos del reto: no pueden ser acciones. */
const actionKeySchema = keySchema.refine((k) => k !== 'video' && k !== 'quiz', {
  message: 'Las claves "video" y "quiz" están reservadas',
});

export const createActionSchema = z.object({
  key: actionKeySchema,
  type: retoActionTypeSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  required: z.boolean().default(true),
  /** Se valida contra el esquema del tipo en el service (parseActionConfig). */
  config: z.record(z.string(), z.unknown()).default({}),
});
export type CreateActionDto = z.infer<typeof createActionSchema>;

export const updateActionSchema = createActionSchema.partial();
export type UpdateActionDto = z.infer<typeof updateActionSchema>;

export const reorderActionsSchema = z.object({
  actionIds: z.array(z.string().uuid()).min(1).max(50),
});
export type ReorderActionsDto = z.infer<typeof reorderActionsSchema>;
