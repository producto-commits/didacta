/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { apiFetch } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

/** Cliente del admin de Retos (POST/GET /api/v1/admin/retos). Solo admins. */

export type RetoActionType =
  | 'PROFILE_QUESTION'
  | 'AI_ANALYZE_IMAGE'
  | 'AI_CHAT_CONSULT'
  | 'SELF_CONFIRM'
  | 'DB_ORDER_CREATED'
  | 'DB_ORDER_DELIVERED';

export interface RetoAction {
  id: string;
  key: string;
  type: RetoActionType;
  title: string;
  description: string | null;
  position: number;
  required: boolean;
  config: Record<string, unknown>;
}

export interface Reto {
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
  status: 'DRAFT' | 'PUBLISHED';
  actions: RetoAction[];
}

export interface RetoInput {
  key: string;
  title: string;
  description?: string;
  moduleKey?: string;
  position: number;
  lessonId?: string | null;
  quizId?: string | null;
  points?: number;
  badge?: { key: string; label: string; emoji?: string } | null;
  completionMessage?: string | null;
  status?: 'DRAFT' | 'PUBLISHED';
}

export interface RetoActionInput {
  key: string;
  type: RetoActionType;
  title: string;
  description?: string;
  required?: boolean;
  config?: Record<string, unknown>;
}

export interface ImportResult {
  courseId: string;
  total: number;
  created: number;
  updated: number;
  withoutLesson: number;
  results: Array<{
    key: string;
    retoId: string;
    action: 'created' | 'updated';
    lessonId: string | null;
    quizId: string | null;
    quizCreated: boolean;
    questionsCreated: number;
    actions: number;
  }>;
}

/** Token de sesión para `apiFetch` (mismo patrón que el resto de clientes). */
function bearer(): string | undefined {
  return authStorage.getAccessToken() ?? undefined;
}

const BASE = '/api/v1/admin/retos';

export const retosAdminApi = {
  catalog(): Promise<{ types: Array<{ type: RetoActionType; needsUpload: boolean }> }> {
    return apiFetch(`${BASE}/catalog`, { method: 'GET' }, bearer());
  },
  list(moduleKey?: string): Promise<Reto[]> {
    const q = moduleKey ? `?moduleKey=${encodeURIComponent(moduleKey)}` : '';
    return apiFetch(`${BASE}${q}`, { method: 'GET' }, bearer());
  },
  get(id: string): Promise<Reto> {
    return apiFetch(`${BASE}/${id}`, { method: 'GET' }, bearer());
  },
  create(input: RetoInput): Promise<Reto> {
    return apiFetch(BASE, { method: 'POST', body: JSON.stringify(input) }, bearer());
  },
  update(id: string, input: Partial<RetoInput>): Promise<Reto> {
    return apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(input) }, bearer());
  },
  remove(id: string): Promise<{ ok: true }> {
    return apiFetch(`${BASE}/${id}`, { method: 'DELETE' }, bearer());
  },
  addAction(retoId: string, input: RetoActionInput): Promise<RetoAction> {
    return apiFetch(
      `${BASE}/${retoId}/actions`,
      { method: 'POST', body: JSON.stringify(input) },
      bearer(),
    );
  },
  updateAction(
    retoId: string,
    actionId: string,
    input: Partial<RetoActionInput>,
  ): Promise<RetoAction> {
    return apiFetch(
      `${BASE}/${retoId}/actions/${actionId}`,
      { method: 'PUT', body: JSON.stringify(input) },
      bearer(),
    );
  },
  removeAction(retoId: string, actionId: string): Promise<{ ok: true }> {
    return apiFetch(`${BASE}/${retoId}/actions/${actionId}`, { method: 'DELETE' }, bearer());
  },
  reorderActions(retoId: string, actionIds: string[]): Promise<Reto> {
    return apiFetch(
      `${BASE}/${retoId}/actions/reorder`,
      { method: 'PUT', body: JSON.stringify({ actionIds }) },
      bearer(),
    );
  },
  importBienvenido(): Promise<ImportResult> {
    return apiFetch(`${BASE}/import/bienvenido`, { method: 'POST', body: '{}' }, bearer());
  },
};
