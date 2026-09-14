'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RetoImageSubmit } from '@/components/reto-image-submit';
import type { MyRetos, RetoWithProgress, StepProgress } from '@/lib/retos';

/** Enlace a la lección del reto dentro de su curso (`?leccion=` la abre directamente). */
export function retoLessonHref(r: RetoWithProgress): string | null {
  if (!r.reto.courseSlug || !r.reto.lessonId) return null;
  return `/cursos/${r.reto.courseSlug}?leccion=${r.reto.lessonId}`;
}

/**
 * Sección "Retos de Dropi" de la página Aprendizaje → Retos (vista del
 * alumno). Sustituye a los retos manuales de gamificación cuando el módulo
 * tiene retos definidos: cada tarjeta muestra el progreso por paso, los puntos
 * e insignia, "Ir al reto" (abre la lección) y, si el reto pide capturas, la
 * entrega directa desde aquí.
 */
export function DropiRetosSection({ data, onRefresh }: { data: MyRetos; onRefresh: () => void }) {
  const t = useTranslations('playersContenido');
  const tr = useTranslations('alumnoSocial');
  const stepLabel = (s: StepProgress) =>
    s.type === 'VIDEO' ? t('reto.stepVideo') : s.type === 'QUIZ' ? t('reto.stepQuiz') : s.title;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-text">{tr('retos.dropiTitulo')}</h2>
          <p className="text-sm text-text-muted">{tr('retos.dropiNota')}</p>
        </div>
        <p className="text-sm text-text-muted tabular-nums">
          {t('reto.modulePercent')}: <b className="text-text">{data.modulePercent} %</b> ·{' '}
          {t('reto.moduleRetos', { completed: data.completedCount, total: data.retos.length })}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.retos.map((r) => {
          const href = retoLessonHref(r);
          const imageActions = r.reto.actions.filter((a) => a.type === 'AI_ANALYZE_IMAGE');
          return (
            <article
              key={r.reto.id}
              className="flex flex-col rounded-2xl border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {t('reto.label', { position: r.reto.position })}
                  </p>
                  <h3 className="font-display text-lg font-bold text-text">{r.reto.title}</h3>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-2xl font-bold text-text tabular-nums">
                    +{r.reto.points}
                  </p>
                  <p className="text-xs text-text-muted">
                    {r.progress.complete ? tr('retos.dropiCompletado') : `${r.progress.percent} %`}
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm">
                {r.progress.steps.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-2">
                    <span className={s.done ? 'text-text' : 'text-text-muted'}>
                      <span aria-hidden="true">{s.done ? '✅ ' : '⬜ '}</span>
                      {stepLabel(s)}
                      {!s.required ? (
                        <span className="text-xs"> · {t('reto.optional')}</span>
                      ) : null}
                    </span>
                    {s.needed > 1 ? (
                      <span className="text-xs text-text-muted tabular-nums">
                        {t('reto.stepCount', { count: s.count, needed: s.needed })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-3"
                aria-hidden="true"
              >
                <div
                  className={r.progress.complete ? 'h-full bg-success-500' : 'h-full bg-brand-500'}
                  style={{ width: `${r.progress.percent}%` }}
                />
              </div>

              {r.reto.badge ? (
                <p className="mt-2 text-xs text-text-muted">
                  {r.reto.badge.emoji ? (
                    <span aria-hidden="true">{r.reto.badge.emoji} </span>
                  ) : null}
                  {r.reto.badge.label}
                </p>
              ) : null}

              {imageActions.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {imageActions.map((a) => {
                    const step = r.progress.steps.find((s) => s.key === a.key);
                    const cfg = a.config;
                    return (
                      <details
                        key={a.key}
                        className="rounded-lg border border-border bg-surface-2 p-3"
                      >
                        <summary className="cursor-pointer text-sm font-semibold text-text">
                          {step?.done ? '✅' : '📎'} {a.title}
                        </summary>
                        <RetoImageSubmit
                          retoId={r.reto.id}
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
                          done={step?.done ?? false}
                          onSubmitted={onRefresh}
                        />
                      </details>
                    );
                  })}
                </div>
              ) : null}

              <div className="mt-auto pt-4">
                {href ? (
                  <Link
                    href={href}
                    className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    {r.progress.complete ? tr('retos.dropiRepasar') : tr('retos.dropiIr')}
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
