'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 *
 * Wizard de perfilamiento (diagnóstico inicial). Una pregunta por pantalla, con
 * avance automático al elegir, barra de progreso y transición animada. El shell
 * `(app)` gatea al alumno aquí mientras `perfilCompletadoAt` sea null. Al
 * terminar guarda las respuestas, refresca la sesión y aterriza en /inicio.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { authStorage } from '@/lib/auth-storage';
import { consumeIntendedPath } from '@/lib/post-login-redirect';
import { PREGUNTAS, perfilamientoApi, type PerfilRespuestas } from '@/lib/perfilamiento';

export default function PerfilamientoPage() {
  const router = useRouter();
  const t = useTranslations('perfilamiento');
  // Las keys de pregunta/opción son dinámicas (`preguntas.<key>.titulo`,
  // `opciones.<key>.<code>`) y el `t` tipado no acepta template literals; las
  // keys existen en el catálogo, así que un accesor laxo es seguro.
  const tr = t as unknown as (key: string) => string;
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<PerfilRespuestas>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gate de entrada: sin sesión → login; ya perfilado → a la app.
  useEffect(() => {
    const token = authStorage.getAccessToken();
    if (!token) {
      router.replace('/signin');
      return;
    }
    const session = authStorage.getSession();
    if (session?.user.perfilCompletadoAt) {
      router.replace(consumeIntendedPath() ?? '/inicio');
      return;
    }
    // Confirmamos contra el backend por si la sesión es vieja (sin el flag).
    void perfilamientoApi
      .status(token)
      .then((s) => {
        if (s.completed) {
          const cur = authStorage.getSession();
          if (cur) {
            cur.user.perfilCompletadoAt = s.completedAt;
            authStorage.saveSession(cur);
          }
          router.replace(consumeIntendedPath() ?? '/inicio');
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true));
  }, [router]);

  const total = PREGUNTAS.length;
  const pregunta = PREGUNTAS[step]!;

  async function submit(finales: PerfilRespuestas) {
    const token = authStorage.getAccessToken();
    if (!token) {
      router.replace('/signin');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await perfilamientoApi.complete(token, finales);
      const session = authStorage.getSession();
      if (session) {
        session.user.perfilCompletadoAt = res.perfilCompletadoAt;
        authStorage.saveSession(session);
      }
      router.replace(consumeIntendedPath() ?? '/inicio');
    } catch {
      setError(t('error'));
      setSubmitting(false);
    }
  }

  function elegir(codigo: string) {
    if (submitting) return;
    const next = { ...answers, [pregunta.key]: codigo };
    setAnswers(next);
    if (step < total - 1) {
      setStep((s) => s + 1);
    } else {
      void submit(next as PerfilRespuestas);
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-md space-y-4" aria-busy="true">
        <div className="skeleton h-3 w-full rounded-full" />
        <div className="skeleton h-8 w-3/4 rounded-lg" />
        <div className="skeleton h-16 w-full rounded-2xl" />
        <div className="skeleton h-16 w-full rounded-2xl" />
        <div className="skeleton h-16 w-full rounded-2xl" />
      </div>
    );
  }

  const seleccion = answers[pregunta.key];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      {/* Progreso */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-text-subtle">
          <span>{t('title')}</span>
          <span aria-hidden="true">
            {step + 1} / {total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Pregunta (re-monta por `key` para re-disparar la animación de entrada) */}
      <div key={step} className="perfil-step-in">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text text-balance">
          {tr(`preguntas.${pregunta.key}.titulo`)}
        </h1>
        <div className="mt-6 flex flex-col gap-3" role="radiogroup">
          {pregunta.opciones.map((codigo) => {
            const activa = seleccion === codigo;
            return (
              <button
                key={codigo}
                type="button"
                role="radio"
                aria-checked={activa}
                disabled={submitting}
                onClick={() => elegir(codigo)}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition-all active:scale-[0.99] disabled:opacity-60 ${
                  activa
                    ? 'border-brand-500 bg-brand-50 text-text ring-2 ring-brand-500/30'
                    : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                    activa ? 'border-brand-500' : 'border-border-strong'
                  }`}
                >
                  {activa ? <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> : null}
                </span>
                <span className="min-w-0">{tr(`opciones.${pregunta.key}.${codigo}`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger-700">
          {error}
        </p>
      ) : null}

      {/* Volver (no en la primera) */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className="text-sm font-semibold text-text-subtle transition-colors hover:text-text disabled:invisible"
        >
          {t('back')}
        </button>
        {submitting ? <span className="text-sm text-text-subtle">{t('saving')}</span> : null}
      </div>
    </div>
  );
}
