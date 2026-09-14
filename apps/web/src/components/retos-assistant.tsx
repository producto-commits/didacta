'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RetoImageSubmit } from '@/components/reto-image-submit';
import { Button } from '@/components/ui/button';
import { authStorage } from '@/lib/auth-storage';
import { retosApi, type MyRetos, type RetoWithProgress } from '@/lib/retos';

/**
 * Asistente flotante de retos (docs/retos/plan-retos.md §3.5): botón fijo en
 * toda la plataforma con dos opciones.
 *   - "Reportar un reto": lista los retos como botones; al elegir uno muestra
 *     sus acciones con entrega de captura (pasos + subir imagen + feedback de
 *     la IA). Es el atajo para entregar sin abrir la lección.
 *   - "Hablar con Dana": agente n8n (Fase E). Hasta entonces se muestra como
 *     "muy pronto".
 * Solo se pinta si el alumno tiene retos publicados.
 */
export function RetosAssistant() {
  const t = useTranslations('playersContenido');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MyRetos | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authStorage.getAccessToken()) return;
    try {
      setData(await retosApi.mine());
    } catch {
      /* sin retos o sin permiso: el botón no se muestra */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!data || data.retos.length === 0) return null;
  const current: RetoWithProgress | undefined = data.retos.find((r) => r.reto.id === selected);
  const imageActions = (r: RetoWithProgress) =>
    r.reto.actions.filter((a) => a.type === 'AI_ANALYZE_IMAGE');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('reto.assistantOpen')}
        className="fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <span aria-hidden="true">🎯</span>
        <span className="hidden sm:inline">{t('reto.assistantOpen')}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('reto.assistantTitle')}
          className="fixed bottom-20 right-5 z-40 flex max-h-[75vh] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
            <h2 className="font-display text-base font-bold text-text">
              {t('reto.assistantTitle')}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('reto.assistantClose')}
              className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-3"
            >
              ✕
            </button>
          </header>

          <div className="overflow-y-auto px-4 py-4">
            {!current ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
                    <p className="font-semibold text-text">{t('reto.assistantDana')}</p>
                    <p className="text-xs text-text-muted">{t('reto.assistantDanaSoon')}</p>
                  </div>
                  <div className="rounded-lg border-2 border-brand-500 bg-brand-50 p-3 text-sm">
                    <p className="font-semibold text-text">{t('reto.assistantReport')}</p>
                    <p className="text-xs text-text-muted">{t('reto.assistantPick')}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {data.retos.map((r) => {
                    const pending = imageActions(r).filter(
                      (a) => !r.progress.steps.find((s) => s.key === a.key)?.done,
                    ).length;
                    return (
                      <li key={r.reto.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(r.reto.id)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-brand-300"
                        >
                          <span className="min-w-0">
                            <span className="font-semibold text-text">
                              {t('reto.label', { position: r.reto.position })}
                            </span>
                            <span className="block truncate text-text-muted">{r.reto.title}</span>
                          </span>
                          <span className="shrink-0 text-xs text-text-muted tabular-nums">
                            {r.progress.percent} %{pending > 0 ? ` · ${pending} 📎` : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-text-muted tabular-nums">
                  {t('reto.modulePercent')}: {data.modulePercent} % ·{' '}
                  {t('reto.moduleRetos', {
                    completed: data.completedCount,
                    total: data.retos.length,
                  })}
                </p>
                <a href="/mensajes" className="block text-xs text-brand-600 hover:underline">
                  {t('reto.assistantMessages')}
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-sm text-brand-600 hover:underline"
                >
                  {t('reto.assistantBack')}
                </button>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {t('reto.label', { position: current.reto.position })}
                  </p>
                  <h3 className="font-display text-lg font-bold text-text">{current.reto.title}</h3>
                  <p className="text-xs text-text-muted tabular-nums">
                    {t('reto.retoPercent')}: {current.progress.percent} %
                  </p>
                </div>
                {imageActions(current).length === 0 ? (
                  <p className="text-sm text-text-muted">{t('reto.assistantNoPending')}</p>
                ) : (
                  imageActions(current).map((a) => {
                    const step = current.progress.steps.find((s) => s.key === a.key);
                    const cfg = a.config;
                    return (
                      <section key={a.key} className="rounded-lg border border-border p-3">
                        <p className="text-sm font-semibold text-text">
                          {step?.done ? '✅' : '⬜'} {a.title}
                          {!a.required ? (
                            <span className="text-xs font-normal text-text-muted">
                              {' '}
                              · {t('reto.optional')}
                            </span>
                          ) : null}
                        </p>
                        <RetoImageSubmit
                          retoId={current.reto.id}
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
                          onSubmitted={() => void load()}
                        />
                      </section>
                    );
                  })
                )}
                {current.progress.complete ? (
                  <div className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm">
                    <p className="font-semibold text-success-700">{t('reto.completedTitle')}</p>
                    {current.reto.completionMessage ? (
                      <p className="mt-1 text-text">{current.reto.completionMessage}</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="pt-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
                    {t('reto.assistantClose')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
