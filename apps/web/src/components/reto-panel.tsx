'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AiTutorPanel } from '@/components/ai-tutor-panel';
import { ProfileQuestion } from '@/components/profile-question';
import { QuizPlayer } from '@/components/quiz-player';
import { RetoImageSubmit } from '@/components/reto-image-submit';
import { Button } from '@/components/ui/button';
import { ApiHttpError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { retosApi, type LessonReto, type StepProgress } from '@/lib/retos';

interface Props {
  data: LessonReto;
  courseId?: string;
  enrollmentId?: string;
  lessonId: string;
  lessonTitle: string;
  /** Vuelve a pedir el progreso al backend (tras quiz aprobado, acción hecha…). */
  onRefresh: () => Promise<LessonReto | null>;
  /** Navegar a otra lección del curso (CTA "Ir al siguiente reto"). */
  onSelectLesson?: (lessonId: string) => void;
}

/**
 * Página del reto (docs/retos/plan-retos.md §3.4), montada bajo el video de la
 * lección: quiz embebido, acciones con su UI, widget de progreso (✅/⬜ por paso,
 * % del reto, % del módulo) y cierre con recompensas + CTA al siguiente reto.
 *
 * El video NO se pinta aquí (lo pinta el player); su paso se marca cuando el
 * player reporta el 100 % real. El motor del backend decide el 100 % del reto.
 */
export function RetoPanel({
  data,
  courseId,
  enrollmentId,
  lessonId,
  lessonTitle,
  onRefresh,
  onSelectLesson,
}: Props) {
  const t = useTranslations('playersContenido');
  const tErrors = useTranslations('errors');
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const { reto, progress } = data;

  async function markDone(actionKey: string, body: { answer?: string } = {}) {
    setPendingKey(actionKey);
    setError(null);
    try {
      await retosApi.actionDone(reto.id, actionKey, body);
      await onRefresh();
    } catch (e) {
      setError(e instanceof ApiHttpError ? apiErrorMessage(e, tErrors) : String(e));
    } finally {
      setPendingKey(null);
    }
  }

  // El "quiz aprobado" llega al motor por el bus (outbox, asíncrono): justo
  // después de enviarlo el progreso puede seguir sin el paso. Se reintenta el
  // refresco unos segundos hasta verlo hecho, para que el widget no se quede
  // atrás.
  async function refreshUntilQuizDone() {
    for (let i = 0; i < 6; i++) {
      // Se usa el dato que devuelve el refresco (el prop `data` de este cierre
      // se quedaría con el valor de cuando se llamó).
      const fresh = await onRefresh();
      if (fresh?.progress.steps.find((s) => s.key === 'quiz')?.done) return;
      await new Promise((r) => setTimeout(r, 1000 + i * 500));
    }
  }

  return (
    // SECCIÓN PROPIA debajo del video, a todo lo ancho (decisión de Dropi):
    // el video queda como protagonista arriba; aquí el reto usa toda la
    // pantalla: evaluación y acciones amplias a la izquierda, progreso a la
    // derecha.
    <section className="mt-8 border-t border-border pt-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {t('reto.label', { position: reto.position })}
          </p>
          <h2 className="font-display text-xl font-bold text-text">{reto.title}</h2>
        </div>
        <p className="text-sm text-text-muted tabular-nums">
          {t('reto.retoPercent')}: <b className="text-text">{progress.percent} %</b>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="space-y-6">
          {/* Quiz embebido: su aprobación llega al motor por el bus (attempt.passed). */}
          {reto.quizId && enrollmentId ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-text">
                <span aria-hidden="true">✓ </span>
                {t('reto.quizTitle')}
              </h3>
              <QuizPlayer
                quizId={reto.quizId}
                enrollmentId={enrollmentId}
                lessonId={lessonId}
                onPassed={() => void refreshUntilQuizDone()}
              />
            </section>
          ) : null}

          {reto.actions.map((a) => {
            const step = progress.steps.find((s) => s.key === a.key);
            const done = step?.done ?? false;
            const cfg = a.config;
            return (
              <section key={a.key} className="rounded-card border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true">{done ? '✅' : '⬜'}</span>
                  <h3 className="text-sm font-semibold text-text">{a.title}</h3>
                  {!a.required ? (
                    <span className="text-xs text-text-muted">· {t('reto.optional')}</span>
                  ) : null}
                  {step && step.needed > 1 ? (
                    <span className="text-xs text-text-muted tabular-nums">
                      · {t('reto.stepCount', { count: step.count, needed: step.needed })}
                    </span>
                  ) : null}
                </div>
                {a.description ? (
                  <p className="mt-1 text-sm text-text-muted">{a.description}</p>
                ) : null}

                {a.type === 'PROFILE_QUESTION' ? (
                  <ProfileQuestion
                    spec={{
                      key: String(cfg['questionKey'] ?? a.key),
                      prompt: String(cfg['prompt'] ?? a.title),
                      options: Array.isArray(cfg['options'])
                        ? (cfg['options'] as unknown[]).filter(
                            (o): o is string => typeof o === 'string',
                          )
                        : [],
                    }}
                    onAnswered={(value) => void markDone(a.key, { answer: value })}
                  />
                ) : null}

                {a.type === 'SELF_CONFIRM' ? (
                  <div className="mt-3 space-y-2">
                    {typeof cfg['instructions'] === 'string' ? (
                      <p className="text-sm text-text">{cfg['instructions']}</p>
                    ) : null}
                    {!done ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pendingKey === a.key}
                        onClick={() => void markDone(a.key)}
                      >
                        {pendingKey === a.key ? t('reto.confirming') : t('reto.confirmAction')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {a.type === 'AI_CHAT_CONSULT' && courseId ? (
                  <div className="mt-3">
                    {typeof cfg['prompt'] === 'string' ? (
                      <p className="mb-2 text-sm text-text-muted">{cfg['prompt']}</p>
                    ) : null}
                    <AiTutorPanel
                      courseId={courseId}
                      lessonId={lessonId}
                      lessonTitle={lessonTitle}
                      onAsked={() => {
                        if (!done) void markDone(a.key);
                      }}
                    />
                  </div>
                ) : null}

                {a.type === 'AI_ANALYZE_IMAGE' ? (
                  <RetoImageSubmit
                    retoId={reto.id}
                    actionKey={a.key}
                    steps={
                      Array.isArray(cfg['steps'])
                        ? (cfg['steps'] as unknown[]).filter(
                            (x): x is string => typeof x === 'string',
                          )
                        : []
                    }
                    count={step?.count ?? 0}
                    needed={step?.needed ?? 1}
                    done={done}
                    onSubmitted={() => void onRefresh()}
                  />
                ) : null}

                {a.type === 'DB_ORDER_CREATED' || a.type === 'DB_ORDER_DELIVERED' ? (
                  <p className="mt-2 text-xs text-text-muted">{t('reto.dbPending')}</p>
                ) : null}
              </section>
            );
          })}

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
            >
              {error}
            </div>
          ) : null}
        </div>

        {/* Progreso del reto y del módulo (widget del spec), a la derecha. */}
        <RetoProgressWidget data={data} t={t} onSelectLesson={onSelectLesson} />
      </div>
    </section>
  );
}

function RetoProgressWidget({
  data,
  t,
  onSelectLesson,
}: {
  data: LessonReto;
  t: ReturnType<typeof useTranslations<'playersContenido'>>;
  onSelectLesson?: (lessonId: string) => void;
}) {
  const { reto, progress } = data;
  const stepLabel = (s: StepProgress) =>
    s.type === 'VIDEO' ? t('reto.stepVideo') : s.type === 'QUIZ' ? t('reto.stepQuiz') : s.title;
  return (
    <aside className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
        {t('reto.label', { position: reto.position })}
      </p>
      <h3 className="mt-1 font-display text-lg font-bold text-text">{reto.title}</h3>

      <h4 className="mt-4 text-sm font-semibold text-text">{t('reto.progressTitle')}</h4>
      <ul className="mt-2 space-y-1.5 text-sm">
        {progress.steps.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={
                  s.done
                    ? 'inline-grid h-5 w-5 place-items-center rounded-full bg-success-500 text-[11px] text-white'
                    : 'inline-grid h-5 w-5 place-items-center rounded-full bg-surface-3 text-[11px] text-text-disabled'
                }
              >
                {s.done ? '✓' : '·'}
              </span>
              <span className={s.done ? 'text-text' : 'text-text-muted'}>
                {stepLabel(s)}
                {!s.required ? <span className="text-xs"> · {t('reto.optional')}</span> : null}
              </span>
            </span>
            <span className="text-xs text-text-muted tabular-nums">
              {s.needed > 1
                ? t('reto.stepCount', { count: s.count, needed: s.needed })
                : s.done
                  ? t('reto.stepDone')
                  : t('reto.stepPending')}
            </span>
          </li>
        ))}
      </ul>

      <Meter label={t('reto.retoPercent')} percent={progress.percent} className="mt-4" />
      <Meter label={t('reto.modulePercent')} percent={data.modulePercent} className="mt-3" />
      <p className="mt-1 text-xs text-text-muted tabular-nums">
        {t('reto.moduleRetos', { completed: data.moduleCompleted, total: data.moduleTotal })}
      </p>

      {progress.complete ? (
        <div className="mt-4 rounded-lg border border-success-200 bg-success-50 p-3 text-sm">
          <p className="font-semibold text-success-700">
            {data.moduleCompleted >= data.moduleTotal && data.moduleTotal > 0
              ? t('reto.moduleDone')
              : t('reto.completedTitle')}
          </p>
          {reto.completionMessage ? (
            <p className="mt-1 text-text">{reto.completionMessage}</p>
          ) : null}
          <p className="mt-2 text-text">
            ⭐ {t('reto.rewardPoints', { points: reto.points })}
            {reto.badge ? (
              <>
                {' · '}
                {reto.badge.emoji ? <span aria-hidden="true">{reto.badge.emoji} </span> : null}
                {reto.badge.label}
              </>
            ) : null}
          </p>
          {data.nextReto?.lessonId && onSelectLesson ? (
            <Button
              type="button"
              size="sm"
              className="mt-3"
              onClick={() => onSelectLesson(data.nextReto!.lessonId!)}
            >
              {t('reto.nextReto')}
            </Button>
          ) : null}
          {data.moduleCompleted >= data.moduleTotal && data.moduleTotal > 0 ? (
            // Cierre del módulo (spec): certificado + siguiente nivel de contenido.
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/certificados"
                className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                {t('reto.ctaCertificate')}
              </a>
              <a
                href="/cursos"
                className="inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text hover:border-brand-300"
              >
                {t('reto.ctaNextCourse')}
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('reto.rewardTitle')}
          </p>
          <p className="mt-1 text-text">
            ⭐ {t('reto.rewardPoints', { points: reto.points })}
            {reto.badge ? (
              <>
                {' · '}
                {reto.badge.emoji ? <span aria-hidden="true">{reto.badge.emoji} </span> : null}
                {reto.badge.label}
              </>
            ) : null}
          </p>
        </div>
      )}
    </aside>
  );
}

function Meter({
  label,
  percent,
  className,
}: {
  label: string;
  percent: number;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{label}</span>
        <span className="font-medium text-text tabular-nums">{p} %</span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={
            p >= 100 ? 'h-full rounded-full bg-success-500' : 'h-full rounded-full bg-brand-500'
          }
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}
