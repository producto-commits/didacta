/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 *
 * Perfilamiento de usuario (diagnóstico inicial) — cliente + estructura de las 5
 * preguntas. Los CÓDIGOS de opción deben coincidir con el backend
 * (`apps/api/src/auth/perfilamiento.ts`); el texto visible vive en el i18n
 * (namespace `perfilamiento`: `preguntas.<key>.titulo`, `opciones.<key>.<code>`).
 */

import { apiFetch } from './api-client';

export type PreguntaKey = 'experiencia' | 'modelo' | 'ordenes' | 'obstaculo' | 'objetivo';

export interface Pregunta {
  key: PreguntaKey;
  /** Códigos de opción (en orden de presentación). */
  opciones: readonly string[];
}

/** Las 5 preguntas, en orden. Ver docs/perfilamiento-usuario-plan.md §2. */
export const PREGUNTAS: readonly Pregunta[] = [
  {
    key: 'experiencia',
    opciones: ['nunca', 'intente_sin_resultado', 'vendi_redes', 'vendi_dropi'],
  },
  {
    key: 'modelo',
    opciones: ['no_se', 'escuche_algo', 'entiendo_no_practique', 'entiendo_practique'],
  },
  { key: 'ordenes', opciones: ['ninguna_reciente', 'ninguna_antiguo', '1_9', '10_100', 'mas_100'] },
  {
    key: 'obstaculo',
    opciones: [
      'producto',
      'publicar_clientes',
      'no_entiendo_dropi',
      'tiempo',
      'malas_experiencias',
      'ninguno_listo',
    ],
  },
  { key: 'objetivo', opciones: ['entender', 'primera_venta', 'volver_vender', 'aumentar_ventas'] },
] as const;

export type PerfilRespuestas = Record<PreguntaKey, string>;

export const perfilamientoApi = {
  async status(
    bearer: string,
  ): Promise<{ completed: boolean; completedAt: string | null; segmento: string | null }> {
    return apiFetch('/api/v1/me/perfilamiento/status', { method: 'GET' }, bearer);
  },
  async complete(
    bearer: string,
    respuestas: PerfilRespuestas,
  ): Promise<{
    ok: boolean;
    segmento: string;
    perfilCompletadoAt: string;
    alreadyCompleted?: boolean;
  }> {
    return apiFetch(
      '/api/v1/me/perfilamiento/complete',
      { method: 'POST', body: JSON.stringify(respuestas) },
      bearer,
    );
  },
};
