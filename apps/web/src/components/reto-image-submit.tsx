'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ApiHttpError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { retosApi, type SubmitImageResult } from '@/lib/retos';

const MAX_BYTES = 6 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

interface Props {
  retoId: string;
  actionKey: string;
  /** Pasos que el alumno debe seguir antes de enviar (config de la acción). */
  steps: string[];
  /** Entregas aprobadas / necesarias ("1 de 2"). */
  count: number;
  needed: number;
  done: boolean;
  /** Tras una entrega válida (para refrescar el progreso del reto). */
  onSubmitted?: (result: SubmitImageResult) => void;
}

/**
 * Entrega de una captura para una acción `AI_ANALYZE_IMAGE` ("Reportar un
 * reto", docs/retos/plan-retos.md §3.5): muestra los pasos, recibe la imagen,
 * la manda a validar con la IA y pinta el feedback (recomendaciones o mensaje
 * fijo). Si no es válida, explica por qué y deja enviar otra.
 */
export function RetoImageSubmit({
  retoId,
  actionKey,
  steps,
  count,
  needed,
  done,
  onSubmitted,
}: Props) {
  const t = useTranslations('playersContenido');
  const tErrors = useTranslations('errors');
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitImageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setResult(null);
    setError(null);
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(t('reto.submitTooBig'));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function send() {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await retosApi.submitImage(retoId, actionKey, {
        imageBase64: dataUrl,
        mimeType: file.type,
      });
      setResult(res);
      if (res.valid) {
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = '';
        onSubmitted?.(res);
      }
    } catch (e) {
      setError(e instanceof ApiHttpError ? apiErrorMessage(e, tErrors) : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {steps.length > 0 ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-text">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}

      {done ? (
        <p className="text-sm font-medium text-success-700">
          ✅ {t('reto.submitDoneAll')}
          {needed > 1 ? ` · ${t('reto.stepCount', { count, needed })}` : ''}
        </p>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('reto.submitTitle')}
            {needed > 1 ? ` · ${t('reto.stepCount', { count, needed })}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id={`reto-img-${retoId}-${actionKey}`}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
            >
              {t('reto.submitPick')}
            </Button>
            <Button type="button" size="sm" onClick={() => void send()} disabled={!file || pending}>
              {pending ? t('reto.submitSending') : t('reto.submitSend')}
            </Button>
            <span className="text-xs text-text-muted">{t('reto.submitTypeHint')}</span>
          </div>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="mt-3 max-h-56 rounded-md border border-border object-contain"
            />
          ) : null}
        </div>
      )}

      {result ? (
        <div
          role="status"
          className={
            result.valid
              ? 'rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-text'
              : 'rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-text'
          }
        >
          <p className="font-semibold">
            {result.valid ? t('reto.submitValid') : t('reto.submitInvalid')}
          </p>
          {result.feedback ? <p className="mt-1 whitespace-pre-line">{result.feedback}</p> : null}
          {result.valid && result.canal ? (
            <p className="mt-1 text-xs text-text-muted">· {result.canal}</p>
          ) : null}
          {!result.valid ? (
            <p className="mt-2 text-xs text-text-muted">{t('reto.submitAnother')}</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
