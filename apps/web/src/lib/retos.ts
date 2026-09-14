/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { apiFetch } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import type { RetoActionType } from '@/lib/retos-admin';

/** Cliente del alumno para los retos (GET/POST /api/v1/me/retos). */

export type StepType = 'VIDEO' | 'QUIZ' | RetoActionType;

export interface StepProgress {
  key: string;
  type: StepType;
  title: string;
  required: boolean;
  done: boolean;
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

export interface RetoView {
  id: string;
  key: string;
  title: string;
  description: string | null;
  moduleKey: string;
  position: number;
  lessonId: string | null;
  courseSlug: string | null;
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

export interface LessonReto extends RetoWithProgress {
  modulePercent: number;
  moduleTotal: number;
  moduleCompleted: number;
  nextReto: { id: string; title: string; lessonId: string | null } | null;
}

export interface MyRetos {
  moduleKey: string;
  modulePercent: number;
  completedCount: number;
  retos: RetoWithProgress[];
}

export interface SubmitImageResult {
  valid: boolean;
  feedback: string;
  canal: string | null;
  count: number;
  needed: number;
  actionDone: boolean;
  retoCompleted: boolean;
  retoJustCompleted: boolean;
}

export interface EvaluateResult {
  progress: RetoProgress;
  completed: boolean;
  justCompleted: boolean;
}

function bearer(): string | undefined {
  return authStorage.getAccessToken() ?? undefined;
}

const BASE = '/api/v1/me/retos';

export const retosApi = {
  mine(moduleKey?: string): Promise<MyRetos> {
    const q = moduleKey ? `?moduleKey=${encodeURIComponent(moduleKey)}` : '';
    return apiFetch(`${BASE}${q}`, { method: 'GET' }, bearer());
  },
  byLesson(lessonId: string): Promise<{ reto: LessonReto | null }> {
    return apiFetch(`${BASE}/by-lesson/${lessonId}`, { method: 'GET' }, bearer());
  },
  videoComplete(retoId: string): Promise<EvaluateResult> {
    return apiFetch(`${BASE}/${retoId}/video-complete`, { method: 'POST', body: '{}' }, bearer());
  },
  submitImage(
    retoId: string,
    actionKey: string,
    body: { imageBase64: string; mimeType: string },
  ): Promise<SubmitImageResult> {
    return apiFetch(
      `${BASE}/${retoId}/actions/${encodeURIComponent(actionKey)}/submit`,
      { method: 'POST', body: JSON.stringify(body) },
      bearer(),
    );
  },
  actionDone(
    retoId: string,
    actionKey: string,
    body: { answer?: string } = {},
  ): Promise<EvaluateResult> {
    return apiFetch(
      `${BASE}/${retoId}/actions/${encodeURIComponent(actionKey)}/done`,
      { method: 'POST', body: JSON.stringify(body) },
      bearer(),
    );
  },
};
