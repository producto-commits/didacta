'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ApiHttpError } from '@/lib/api-client';
import { danaApi, type DanaMessage } from '@/lib/dana';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/**
 * Hilo con Dana (agente n8n) dentro del asistente de retos. Las respuestas
 * pueden llegar síncronas (n8n contesta al POST) o por el webhook receptor:
 * mientras haya un mensaje sin respuesta se sondea el hilo cada 3 s.
 */
export function DanaChat() {
  const t = useTranslations('playersContenido');
  const tErrors = useTranslations('errors');
  const [messages, setMessages] = useState<DanaMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const list = await danaApi.list();
      setMessages(list);
      const last = list[list.length - 1];
      setWaiting(Boolean(last && last.direction === 'IN' && last.status !== 'FAILED'));
    } catch {
      /* sin hilo aún */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Sondeo mientras esperamos la respuesta asíncrona de Dana (máx. ~2 min).
  useEffect(() => {
    if (!waiting) return;
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks++;
      void load();
      if (ticks > 40) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [waiting, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send() {
    const mensaje = text.trim();
    if (!mensaje || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await danaApi.send(mensaje);
      setText('');
      setMessages((prev) => [...prev, res.sent, ...(res.reply ? [res.reply] : [])]);
      setWaiting(!res.reply);
    } catch (e) {
      setError(e instanceof ApiHttpError ? apiErrorMessage(e, tErrors) : t('reto.danaError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">{t('reto.danaIntro')}</p>
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-text-muted">{t('reto.danaEmpty')}</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.direction === 'IN'
                  ? 'ml-6 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white'
                  : 'mr-6 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text'
              }
            >
              <p className="mb-0.5 text-[10px] uppercase tracking-wide opacity-70">
                {m.direction === 'IN' ? t('reto.danaYou') : t('reto.danaHer')}
              </p>
              <p className="whitespace-pre-line">{m.text}</p>
            </div>
          ))
        )}
        {waiting ? <p className="text-xs text-text-muted">{t('reto.danaWaiting')}</p> : null}
        <div ref={bottomRef} />
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 p-2 text-xs text-danger-700"
        >
          {error}
        </div>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          id="dana-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('reto.danaPlaceholder')}
          maxLength={4000}
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
          disabled={sending}
        />
        <Button type="submit" size="sm" disabled={sending || !text.trim()}>
          {sending ? t('reto.danaSending') : t('reto.danaSend')}
        </Button>
      </form>
    </div>
  );
}
