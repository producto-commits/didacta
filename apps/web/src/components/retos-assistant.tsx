'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DanaChat } from '@/components/dana-chat';
import { retoLessonHref } from '@/components/dropi-retos-section';
import { RetoImageSubmit } from '@/components/reto-image-submit';
import { authStorage } from '@/lib/auth-storage';
import { formatDate, formatTime } from '@/lib/i18n/format';
import { danaApi, type DanaConversation } from '@/lib/dana';
import { retosApi, type MyRetos, type RetoSubmission, type RetoWithProgress } from '@/lib/retos';

type Tab = 'home' | 'messages' | 'retos';

/**
 * Asistente flotante (docs/retos/plan-retos.md §3.5), con el formato del
 * widget de soporte de Dropi: botón redondo y panel con tres pestañas.
 *   - Inicio: saludo + tarjetas "Hablar con Dana", "Reportar un reto" y progreso.
 *   - Mensajes: conversaciones con Dana (agente n8n) e hilo abierto.
 *   - Retos: elegir un reto por botones y enviar sus capturas; "Retos
 *     enviados" con el historial (aprobadas/rechazadas).
 * Se pinta si el alumno tiene retos publicados o Dana está configurada.
 */
export function RetosAssistant() {
  const t = useTranslations('playersContenido');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [data, setData] = useState<MyRetos | null>(null);
  const [danaEnabled, setDanaEnabled] = useState(false);

  // Mensajes
  const [conversations, setConversations] = useState<DanaConversation[]>([]);
  /** `undefined` = lista; `null` = conversación nueva; string = hilo. */
  const [conversation, setConversation] = useState<string | null | undefined>(undefined);

  // Retos
  const [subTab, setSubTab] = useState<'send' | 'sent'>('send');
  const [selected, setSelected] = useState<string | null>(null);
  const [sent, setSent] = useState<RetoSubmission[] | null>(null);

  const loadRetos = useCallback(async () => {
    if (!authStorage.getAccessToken()) return;
    try {
      setData(await retosApi.mine());
    } catch {
      /* sin retos o sin permiso */
    }
  }, []);
  const loadConversations = useCallback(async () => {
    if (!danaEnabled) return;
    try {
      setConversations(await danaApi.conversations());
    } catch {
      /* sin hilo aún */
    }
  }, [danaEnabled]);
  const loadSent = useCallback(async () => {
    try {
      setSent(await retosApi.submissions());
    } catch {
      setSent([]);
    }
  }, []);

  useEffect(() => {
    void loadRetos();
    if (authStorage.getAccessToken()) {
      danaApi
        .status()
        .then((s) => setDanaEnabled(Boolean(s.enabled)))
        .catch(() => setDanaEnabled(false));
    }
  }, [loadRetos]);

  useEffect(() => {
    if (!open) return;
    void loadRetos();
    void loadConversations();
    if (tab === 'retos' && subTab === 'sent') void loadSent();
  }, [open, tab, subTab, loadRetos, loadConversations, loadSent]);

  const retos = data?.retos ?? [];
  if (retos.length === 0 && !danaEnabled) return null;

  const firstName = (authStorage.getSession()?.user.name ?? '').trim().split(/\s+/)[0] ?? '';
  const current: RetoWithProgress | undefined = retos.find((r) => r.reto.id === selected);
  const imageActions = (r: RetoWithProgress) =>
    r.reto.actions.filter((a) => a.type === 'AI_ANALYZE_IMAGE');

  const openDana = () => {
    setTab('messages');
    const active = conversations.find((c) => c.open);
    setConversation(active ? active.id : null);
  };

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('reto.assistantOpen')}
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('reto.assistantTitle')}
          className="fixed bottom-24 right-5 z-40 flex h-[min(660px,calc(100dvh-7.5rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl"
        >
          {/* ── Cuerpo por pestaña ─────────────────────────────────────── */}
          {tab === 'home' ? (
            <HomeTab
              t={t}
              firstName={firstName}
              danaEnabled={danaEnabled}
              hasRetos={retos.length > 0}
              data={data}
              onDana={openDana}
              onReport={() => {
                setTab('retos');
                setSubTab('send');
              }}
              onClose={close}
            />
          ) : null}

          {tab === 'messages' ? (
            conversation === undefined ? (
              <>
                <PanelHeader title={t('reto.assistantTabMessages')} onClose={close} />
                <div className="flex min-h-0 flex-1 flex-col">
                  {conversations.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                      <span className="text-text" aria-hidden="true">
                        <ChatIcon size={28} />
                      </span>
                      <p className="font-display text-base font-bold text-text">
                        {t('reto.assistantNoConversations')}
                      </p>
                      <p className="text-sm text-text-muted">
                        {t('reto.assistantNoConversationsHint')}
                      </p>
                    </div>
                  ) : (
                    <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                      {conversations.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setConversation(c.id)}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
                          >
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
                              <DanaIcon />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-text">
                                  {c.title}
                                </span>
                                <span className="shrink-0 text-[11px] text-text-muted tabular-nums">
                                  {shortDate(c.lastAt)}
                                </span>
                              </span>
                              <span className="block truncate text-xs text-text-muted">
                                {c.lastDirection === 'OUT' ? `${t('reto.danaHer')}: ` : ''}
                                {c.lastText}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex justify-center border-t border-border px-4 py-3">
                    <button
                      type="button"
                      disabled={!danaEnabled}
                      onClick={openDana}
                      className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t('reto.assistantDanaCard')} <SendIcon />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <PanelHeader
                  title={t('reto.danaHer')}
                  subtitle={t('reto.danaIntro')}
                  onBack={() => {
                    setConversation(undefined);
                    void loadConversations();
                  }}
                  onClose={close}
                  action={
                    conversation ? (
                      <button
                        type="button"
                        onClick={() => setConversation(null)}
                        className="text-xs font-semibold text-brand-600 hover:underline"
                      >
                        {t('reto.assistantNewConversation')}
                      </button>
                    ) : null
                  }
                />
                <DanaChat
                  conversationId={conversation}
                  closed={Boolean(
                    conversation && !conversations.find((c) => c.id === conversation)?.open,
                  )}
                  onConversation={(id) => {
                    setConversation(id);
                    void loadConversations();
                  }}
                />
              </>
            )
          ) : null}

          {tab === 'retos' ? (
            <>
              <PanelHeader
                title={t('reto.assistantTabRetos')}
                onBack={current ? () => setSelected(null) : undefined}
                onClose={close}
              />
              {!current ? (
                <div className="flex gap-1 border-b border-border px-4 pt-1">
                  {(['send', 'sent'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSubTab(k)}
                      className={
                        subTab === k
                          ? 'border-b-2 border-brand-600 px-3 py-2 text-sm font-semibold text-text'
                          : 'border-b-2 border-transparent px-3 py-2 text-sm text-text-muted hover:text-text'
                      }
                    >
                      {k === 'send' ? t('reto.assistantSubTabSend') : t('reto.assistantSubTabSent')}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {current ? (
                  <RetoDetail
                    t={t}
                    r={current}
                    actions={imageActions(current)}
                    onSubmitted={() => {
                      void loadRetos();
                      setSent(null);
                    }}
                  />
                ) : subTab === 'send' ? (
                  retos.length === 0 ? (
                    <p className="text-sm text-text-muted">{t('reto.assistantEmpty')}</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="mr-8 rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2 text-sm text-text">
                        {t('reto.assistantPickReto')}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {retos.map((r) => {
                          const pending = imageActions(r).filter(
                            (a) => !r.progress.steps.find((s) => s.key === a.key)?.done,
                          ).length;
                          return (
                            <button
                              key={r.reto.id}
                              type="button"
                              onClick={() => setSelected(r.reto.id)}
                              className="rounded-full border border-brand-300 bg-surface px-3.5 py-2 text-sm font-medium text-text hover:bg-brand-50"
                            >
                              {t('reto.label', { position: r.reto.position })} · {r.reto.title}
                              {pending > 0 ? (
                                <span className="ml-1 text-xs text-brand-600">📎{pending}</span>
                              ) : r.progress.complete ? (
                                <span className="ml-1 text-xs">✅</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                ) : sent === null ? (
                  <p className="text-sm text-text-muted">…</p>
                ) : sent.length === 0 ? (
                  <p className="text-sm text-text-muted">{t('reto.assistantNoSent')}</p>
                ) : (
                  <ul className="space-y-2">
                    {sent.map((s) => (
                      <li key={s.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold text-text">
                            {t('reto.label', { position: s.retoPosition })} · {s.actionTitle}
                          </span>
                          <span
                            className={
                              s.verdict === 'APPROVED'
                                ? 'shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700'
                                : 'shrink-0 rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-700'
                            }
                          >
                            {s.verdict === 'APPROVED'
                              ? t('reto.assistantSentApproved')
                              : t('reto.assistantSentRejected')}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs text-text-muted">{s.feedback}</p>
                        <p className="mt-1 text-[11px] text-text-subtle tabular-nums">
                          {s.retoTitle} · {shortDate(s.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}

          {/* ── Barra de pestañas ──────────────────────────────────────── */}
          <nav className="grid grid-cols-3 border-t border-border bg-surface">
            <TabButton
              active={tab === 'home'}
              label={t('reto.assistantTabHome')}
              icon={<HomeIcon />}
              onClick={() => setTab('home')}
            />
            <TabButton
              active={tab === 'messages'}
              label={t('reto.assistantTabMessages')}
              icon={<ChatIcon size={20} />}
              onClick={() => {
                setTab('messages');
                setConversation(undefined);
              }}
            />
            <TabButton
              active={tab === 'retos'}
              label={t('reto.assistantTabRetos')}
              icon={<TargetIcon />}
              onClick={() => {
                setTab('retos');
                setSelected(null);
              }}
            />
          </nav>
        </div>
      ) : null}
    </>
  );
}

type T = ReturnType<typeof useTranslations<'playersContenido'>>;

function HomeTab({
  t,
  firstName,
  danaEnabled,
  hasRetos,
  data,
  onDana,
  onReport,
  onClose,
}: {
  t: T;
  firstName: string;
  danaEnabled: boolean;
  hasRetos: boolean;
  data: MyRetos | null;
  onDana: () => void;
  onReport: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="bg-gradient-to-b from-brand-600 via-brand-500 to-surface px-5 pb-20 pt-4 text-white">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-bold">dropi</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('reto.assistantClose')}
            className="rounded-full p-1 hover:bg-white/15"
          >
            <CloseIcon />
          </button>
        </div>
        <p className="mt-10 font-display text-2xl font-bold leading-tight">
          {firstName ? t('reto.assistantHello', { name: firstName }) : t('reto.assistantHelloAnon')}
        </p>
        <p className="font-display text-2xl font-bold leading-tight">{t('reto.assistantHow')}</p>
      </div>
      <div className="-mt-14 space-y-3 px-4 pb-4">
        <HomeCard
          title={t('reto.assistantDanaCard')}
          hint={danaEnabled ? t('reto.assistantDanaCardHint') : t('reto.assistantDanaSoon')}
          disabled={!danaEnabled}
          onClick={onDana}
        />
        {hasRetos ? (
          <HomeCard
            title={t('reto.assistantReportCard')}
            hint={t('reto.assistantReportCardHint')}
            onClick={onReport}
          />
        ) : null}
        {data && data.retos.length > 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-sm font-semibold text-text">{t('reto.assistantProgressCard')}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-brand-600"
                style={{ width: `${Math.min(100, data.modulePercent)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-text-muted tabular-nums">
              {t('reto.modulePercent')}: {data.modulePercent} % ·{' '}
              {t('reto.moduleRetos', { completed: data.completedCount, total: data.retos.length })}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HomeCard({
  title,
  hint,
  disabled,
  onClick,
}: {
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-md hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text">{title}</span>
        <span className="block text-xs text-text-muted">{hint}</span>
      </span>
      <span className="shrink-0 text-brand-600" aria-hidden="true">
        <SendIcon />
      </span>
    </button>
  );
}

function RetoDetail({
  t,
  r,
  actions,
  onSubmitted,
}: {
  t: T;
  r: RetoWithProgress;
  actions: RetoWithProgress['reto']['actions'];
  onSubmitted: () => void;
}) {
  const href = retoLessonHref(r);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          {t('reto.label', { position: r.reto.position })}
        </p>
        <h3 className="font-display text-lg font-bold text-text">{r.reto.title}</h3>
        <p className="text-xs text-text-muted tabular-nums">
          {t('reto.retoPercent')}: {r.progress.percent} %
        </p>
      </div>
      {actions.length === 0 ? (
        <p className="text-sm text-text-muted">{t('reto.assistantNoPending')}</p>
      ) : (
        actions.map((a) => {
          const step = r.progress.steps.find((s) => s.key === a.key);
          const cfg = a.config;
          return (
            <section key={a.key} className="rounded-xl border border-border p-3">
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
                retoId={r.reto.id}
                actionKey={a.key}
                steps={
                  Array.isArray(cfg['steps'])
                    ? (cfg['steps'] as unknown[]).filter((x): x is string => typeof x === 'string')
                    : []
                }
                count={step?.count ?? 0}
                needed={step?.needed ?? 1}
                done={step?.done ?? false}
                onSubmitted={onSubmitted}
              />
            </section>
          );
        })
      )}
      {r.progress.complete ? (
        <div className="rounded-xl border border-success-200 bg-success-50 p-3 text-sm">
          <p className="font-semibold text-success-700">{t('reto.completedTitle')}</p>
          {r.reto.completionMessage ? (
            <p className="mt-1 text-text">{r.reto.completionMessage}</p>
          ) : null}
        </div>
      ) : null}
      {href ? (
        <Link href={href} className="block text-sm font-semibold text-brand-600 hover:underline">
          {t('reto.assistantGoLesson')}
        </Link>
      ) : null}
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  onBack,
  onClose,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-border px-3 py-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="←"
          className="rounded-full p-1 text-text-muted hover:bg-surface-2"
        >
          <BackIcon />
        </button>
      ) : null}
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate font-display text-base font-bold text-text">{title}</p>
        {subtitle ? <p className="truncate text-[11px] text-text-muted">{subtitle}</p> : null}
      </div>
      {action}
      <button
        type="button"
        onClick={onClose}
        aria-label="✕"
        className="rounded-full p-1 text-text-muted hover:bg-surface-2"
      >
        <CloseIcon />
      </button>
    </header>
  );
}

function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-brand-600'
          : 'flex flex-col items-center gap-0.5 py-2.5 text-[11px] text-text-muted hover:text-text'
      }
    >
      {icon}
      {label}
    </button>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? formatTime(d, { hour: '2-digit', minute: '2-digit' })
    : formatDate(d, { day: '2-digit', month: 'short' });
}

/* Iconos inline (sin dependencias). */
function ChatIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3C6.5 3 2 6.6 2 11c0 2.3 1.2 4.4 3.2 5.9L4 21l4.6-2.1c1.1.3 2.2.4 3.4.4 5.5 0 10-3.6 10-8.3S17.5 3 12 3Zm-4 9.2a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm4 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm4 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 11.5 21 3l-7 18-2.5-7.5L3 11.5Z" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
function DanaIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}
