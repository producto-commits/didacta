'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useEffect, useState } from 'react';
import { authStorage } from '@/lib/auth-storage';
import { meApi } from '@/lib/me';

export interface ProfileQuestionSpec {
  key: string;
  prompt: string;
  options: string[];
}

/**
 * "Pregunta de perfil": single-choice que NO puntúa ni bloquea el avance; su
 * única función es capturar un dato del alumno para personalización futura
 * (p.ej. la del Reto 1 "¿Cuál es tu situación actual?"). La respuesta se guarda
 * al instante en el perfil del usuario (`/me/profile-answers`). En `preview`
 * (editor/admin) no persiste.
 */
export function ProfileQuestion({
  spec,
  preview,
  onAnswered,
}: {
  spec: ProfileQuestionSpec;
  preview?: boolean;
  /** Se dispara tras guardar la respuesta (el reto lo usa para marcar la acción hecha). */
  onAnswered?: (value: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (preview) return;
    const token = authStorage.getAccessToken();
    if (!token) return;
    let cancelled = false;
    meApi
      .getProfileAnswers(token)
      .then((res) => {
        const a = res.answers.find((x) => x.questionKey === spec.key);
        if (!cancelled && a) {
          setSelected(a.value);
          setSaved(true);
        }
      })
      .catch(() => {
        /* sin respuesta previa o fallo de red: se empieza sin selección */
      });
    return () => {
      cancelled = true;
    };
  }, [spec.key, preview]);

  async function choose(value: string) {
    setSelected(value);
    setSaved(false);
    if (preview) {
      setSaved(true);
      return;
    }
    const token = authStorage.getAccessToken();
    if (!token) return;
    setPending(true);
    try {
      await meApi.saveProfileAnswer(token, spec.key, value);
      setSaved(true);
      onAnswered?.(value);
    } catch {
      /* best-effort: no bloquea el reto */
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 rounded-card border border-border bg-surface-2 p-5">
      <h3 className="text-sm font-semibold text-text">{spec.prompt}</h3>
      <div className="mt-3 space-y-2">
        {spec.options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={pending}
            onClick={() => void choose(opt)}
            className={
              selected === opt
                ? 'flex w-full items-center gap-2 rounded-lg border-2 border-brand-500 bg-brand-50 px-3 py-2 text-left text-sm font-medium text-text'
                : 'flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-text transition-colors hover:border-brand-300'
            }
          >
            <span
              aria-hidden="true"
              className={selected === opt ? 'text-brand-600' : 'text-text-disabled'}
            >
              {selected === opt ? '●' : '○'}
            </span>
            {opt}
          </button>
        ))}
      </div>
      {saved && selected ? (
        <p className="mt-2 text-xs text-success-700">Respuesta guardada ✓</p>
      ) : null}
    </div>
  );
}

/**
 * Parsea `content.profileQuestion` a un spec válido, o null. Requiere prompt,
 * al menos 2 opciones y una clave (cae a un slug del prompt si falta).
 */
export function parseProfileQuestion(content: Record<string, unknown>): ProfileQuestionSpec | null {
  const raw = content['profileQuestion'];
  if (!raw || typeof raw !== 'object') return null;
  const pq = raw as Record<string, unknown>;
  const prompt = typeof pq['prompt'] === 'string' ? pq['prompt'].trim() : '';
  const options = Array.isArray(pq['options'])
    ? pq['options'].filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
    : [];
  if (!prompt || options.length < 2) return null;
  const keyRaw = typeof pq['key'] === 'string' && pq['key'].trim() ? pq['key'].trim() : prompt;
  const key = keyRaw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!key) return null;
  return { key, prompt, options };
}
