'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiHttpError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import {
  retosAdminApi,
  type ImportResult,
  type Reto,
  type RetoAction,
  type RetoActionType,
  type RetoInput,
} from '@/lib/retos-admin';

const ACTION_TYPES: RetoActionType[] = [
  'PROFILE_QUESTION',
  'AI_ANALYZE_IMAGE',
  'AI_CHAT_CONSULT',
  'SELF_CONFIRM',
  'DB_ORDER_CREATED',
  'DB_ORDER_DELIVERED',
];

/** Plantilla de config por tipo, para que el admin no arranque de un JSON vacío. */
const CONFIG_TEMPLATES: Record<RetoActionType, Record<string, unknown>> = {
  PROFILE_QUESTION: {
    questionKey: 'situacion-actual',
    prompt: '¿Cuál es tu situación actual?',
    options: ['Soy nuevo en el comercio electrónico', 'Quiero emprender'],
  },
  AI_ANALYZE_IMAGE: {
    steps: ['Explora el catálogo de Dropi y elige un producto.', 'Toma una captura y súbela aquí.'],
    submissions: 1,
    feedbackMode: 'analysis',
    prompt:
      'La imagen debe mostrar un producto del catálogo de Dropi. Si lo es, responde con recomendaciones de venta.',
  },
  AI_CHAT_CONSULT: { prompt: 'Consulta al tutor sobre tu producto.' },
  SELF_CONFIRM: { instructions: 'Confirma cuando hayas hecho la acción.' },
  DB_ORDER_CREATED: {},
  DB_ORDER_DELIVERED: {},
};

interface RetoDraft {
  key: string;
  title: string;
  description: string;
  moduleKey: string;
  position: string;
  points: string;
  badgeEmoji: string;
  badgeLabel: string;
  badgeKey: string;
  lessonId: string;
  quizId: string;
  completionMessage: string;
  status: 'DRAFT' | 'PUBLISHED';
}

const EMPTY_DRAFT: RetoDraft = {
  key: '',
  title: '',
  description: '',
  moduleKey: 'bienvenido',
  position: '1',
  points: '0',
  badgeEmoji: '',
  badgeLabel: '',
  badgeKey: '',
  lessonId: '',
  quizId: '',
  completionMessage: '',
  status: 'DRAFT',
};

function draftFrom(r: Reto): RetoDraft {
  return {
    key: r.key,
    title: r.title,
    description: r.description ?? '',
    moduleKey: r.moduleKey,
    position: String(r.position),
    points: String(r.points),
    badgeEmoji: r.badgeEmoji ?? '',
    badgeLabel: r.badgeLabel ?? '',
    badgeKey: r.badgeKey ?? '',
    lessonId: r.lessonId ?? '',
    quizId: r.quizId ?? '',
    completionMessage: r.completionMessage ?? '',
    status: r.status,
  };
}

function inputFrom(d: RetoDraft): RetoInput {
  const badge = d.badgeLabel.trim()
    ? {
        key: (d.badgeKey.trim() || d.badgeLabel.trim().toLowerCase().replace(/\s+/g, '-')).slice(
          0,
          64,
        ),
        label: d.badgeLabel.trim(),
        emoji: d.badgeEmoji.trim() || undefined,
      }
    : null;
  return {
    key: d.key.trim(),
    title: d.title.trim(),
    description: d.description.trim() || undefined,
    moduleKey: d.moduleKey.trim() || 'bienvenido',
    position: Number(d.position) || 1,
    points: Number(d.points) || 0,
    badge,
    lessonId: d.lessonId.trim() || null,
    quizId: d.quizId.trim() || null,
    completionMessage: d.completionMessage.trim() || null,
    status: d.status,
  };
}

export default function AdminRetosPage() {
  const t = useTranslations('adminRetos');
  const tErrors = useTranslations('errors');
  const [retos, setRetos] = useState<Reto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showNew, setShowNew] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRetos(await retosAdminApi.list());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? apiErrorMessage(e, tErrors) : t('errorLoad'));
    }
  }, [t, tErrors]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleImport() {
    setImporting(true);
    setError(null);
    setInfo(null);
    setImportResult(null);
    try {
      const res = await retosAdminApi.importBienvenido();
      setImportResult(res);
      setInfo(t('importDoneOk', { created: res.created, updated: res.updated, total: res.total }));
      await reload();
    } catch (e) {
      setError(e instanceof ApiHttpError ? apiErrorMessage(e, tErrors) : t('importConnectionCut'));
    } finally {
      setImporting(false);
    }
  }

  function fail(e: unknown) {
    setError(e instanceof ApiHttpError ? apiErrorMessage(e, tErrors) : String(e));
  }

  if (retos === null && !error) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-text-muted">{t('subtitle')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setShowNew((v) => !v)}>
          {t('newReto')}
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
        >
          {error}
        </div>
      ) : null}
      {info ? (
        <div
          role="status"
          className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700"
        >
          {info}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('importTitle')}</CardTitle>
          <CardDescription>{t('importDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" onClick={() => void handleImport()} disabled={importing}>
            {importing ? t('importing') : t('importRun')}
          </Button>
          {importResult && importResult.withoutLesson > 0 ? (
            <p className="text-sm text-warning-700">
              {t('importWithoutLesson', { n: importResult.withoutLesson })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {showNew ? (
        <RetoForm
          initial={EMPTY_DRAFT}
          submitLabel={t('create')}
          pendingLabel={t('creating')}
          onCancel={() => setShowNew(false)}
          onSubmit={async (draft) => {
            try {
              await retosAdminApi.create(inputFrom(draft));
              setShowNew(false);
              setInfo(t('saved'));
              await reload();
            } catch (e) {
              fail(e);
            }
          }}
        />
      ) : null}

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold">{t('listTitle')}</h2>
        {retos && retos.length === 0 ? (
          <p className="text-sm text-text-muted">{t('empty')}</p>
        ) : null}
        {retos?.map((reto) => (
          <RetoCard key={reto.id} reto={reto} onChanged={reload} onError={fail} onInfo={setInfo} />
        ))}
      </div>
    </section>
  );
}

function RetoCard({
  reto,
  onChanged,
  onError,
  onInfo,
}: {
  reto: Reto;
  onChanged: () => Promise<void>;
  onError: (e: unknown) => void;
  onInfo: (msg: string) => void;
}) {
  const t = useTranslations('adminRetos');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  async function handleDelete() {
    if (!window.confirm(t('confirmDelete', { title: reto.title }))) return;
    try {
      await retosAdminApi.remove(reto.id);
      await onChanged();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-text-muted">{reto.position}.</span>
            {reto.badgeEmoji ? <span aria-hidden="true">{reto.badgeEmoji}</span> : null}
            <span>{reto.title}</span>
            <Badge variant="outline">{t(`status.${reto.status}`)}</Badge>
            <Badge variant="outline" className="tabular-nums">
              +{reto.points}
            </Badge>
          </CardTitle>
          <CardDescription className="mt-1">
            <code className="text-xs">{reto.key}</code>
            {reto.badgeLabel ? <> · {reto.badgeLabel}</> : null}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? t('cancel') : t('edit')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete()}>
            {t('delete')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <RetoForm
            initial={draftFrom(reto)}
            submitLabel={t('save')}
            pendingLabel={t('saving')}
            onCancel={() => setEditing(false)}
            onSubmit={async (draft) => {
              try {
                await retosAdminApi.update(reto.id, inputFrom(draft));
                setEditing(false);
                onInfo(t('saved'));
                await onChanged();
              } catch (e) {
                onError(e);
              }
            }}
          />
        ) : null}

        <div>
          <h3 className="text-sm font-semibold">{t('actionsTitle')}</h3>
          <p className="text-xs text-text-muted">{t('actionsHint')}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <span aria-hidden="true">▶</span>
              <span>{t('implicit.video')}</span>
              {!reto.lessonId ? (
                <Badge variant="outline" className="text-warning-700">
                  {t('implicit.missingLesson')}
                </Badge>
              ) : null}
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true">✓</span>
              <span>{t('implicit.quiz')}</span>
              {!reto.quizId ? (
                <Badge variant="outline" className="text-warning-700">
                  {t('implicit.missingQuiz')}
                </Badge>
              ) : null}
            </li>
          </ul>
          {reto.actions.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">{t('actionsEmpty')}</p>
          ) : (
            <div className="mt-3 space-y-3">
              {reto.actions.map((a) => (
                <ActionRow
                  key={a.id}
                  retoId={reto.id}
                  action={a}
                  onChanged={onChanged}
                  onError={onError}
                />
              ))}
            </div>
          )}
          <div className="mt-3">
            {adding ? (
              <ActionForm
                onCancel={() => setAdding(false)}
                onSubmit={async (input) => {
                  try {
                    await retosAdminApi.addAction(reto.id, input);
                    setAdding(false);
                    await onChanged();
                  } catch (e) {
                    onError(e);
                  }
                }}
              />
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
                {t('addAction')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionRow({
  retoId,
  action,
  onChanged,
  onError,
}: {
  retoId: string;
  action: RetoAction;
  onChanged: () => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const t = useTranslations('adminRetos');
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(JSON.stringify(action.config, null, 2));
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      const parsed = JSON.parse(config) as Record<string, unknown>;
      await retosAdminApi.updateAction(retoId, action.id, { config: parsed });
      setOpen(false);
      await onChanged();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    try {
      await retosAdminApi.removeAction(retoId, action.id);
      await onChanged();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{t(`types.${action.type}`)}</Badge>
          <span className="font-medium">{action.title}</span>
          <code className="text-xs text-text-muted">{action.key}</code>
          <span
            className={action.required ? 'text-xs text-text-muted' : 'text-xs text-warning-700'}
          >
            {action.required ? t('actionRequired') : t('actionOptional')}
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? t('cancel') : t('edit')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void remove()}>
            {t('removeAction')}
          </Button>
        </div>
      </div>
      {open ? (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`cfg-${action.id}`}>{t('actionConfig')}</Label>
          <Textarea
            id={`cfg-${action.id}`}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            rows={8}
            className="font-mono text-xs"
          />
          <p className="text-xs text-text-muted">{t('actionConfigHelp')}</p>
          <Button type="button" size="sm" onClick={() => void save()} disabled={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ActionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: {
    key: string;
    type: RetoActionType;
    title: string;
    required: boolean;
    config: Record<string, unknown>;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('adminRetos');
  const [type, setType] = useState<RetoActionType>('PROFILE_QUESTION');
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [required, setRequired] = useState(true);
  const [config, setConfig] = useState(JSON.stringify(CONFIG_TEMPLATES.PROFILE_QUESTION, null, 2));
  const [pending, setPending] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  function changeType(next: RetoActionType) {
    setType(next);
    setConfig(JSON.stringify(CONFIG_TEMPLATES[next], null, 2));
  }

  async function submit() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(config) as Record<string, unknown>;
      setJsonError(null);
    } catch (e) {
      setJsonError(String(e));
      return;
    }
    setPending(true);
    try {
      await onSubmit({ key: key.trim(), type, title: title.trim(), required, config: parsed });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="new-action-type">{t('actionType')}</Label>
          <select
            id="new-action-type"
            value={type}
            onChange={(e) => changeType(e.target.value as RetoActionType)}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          >
            {ACTION_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(`types.${tp}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-action-key">{t('actionKey')}</Label>
          <Input
            id="new-action-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="perfil"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-action-title">{t('actionTitle')}</Label>
          <Input id="new-action-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          id="new-action-required"
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        {t('actionRequired')}
      </label>
      <div className="space-y-1">
        <Label htmlFor="new-action-config">{t('actionConfig')}</Label>
        <Textarea
          id="new-action-config"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          rows={8}
          className="font-mono text-xs"
        />
        <p className="text-xs text-text-muted">{t('actionConfigHelp')}</p>
        {jsonError ? <p className="text-xs text-danger-700">{jsonError}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void submit()}
          disabled={pending || !key.trim() || !title.trim()}
        >
          {pending ? t('adding') : t('addAction')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}

function RetoForm({
  initial,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
}: {
  initial: RetoDraft;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (draft: RetoDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('adminRetos');
  const [d, setD] = useState<RetoDraft>(initial);
  const [pending, setPending] = useState(false);
  const set =
    (k: keyof RetoDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setD((prev) => ({ ...prev, [k]: e.target.value }));
  const uid = initial.key || 'new';

  async function submit() {
    setPending(true);
    try {
      await onSubmit(d);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${uid}-key`} label={t('fields.key')} help={t('fields.keyHelp')}>
          <Input id={`${uid}-key`} value={d.key} onChange={set('key')} placeholder="bienvenido-1" />
        </Field>
        <Field id={`${uid}-title`} label={t('fields.title')}>
          <Input id={`${uid}-title`} value={d.title} onChange={set('title')} />
        </Field>
        <Field id={`${uid}-module`} label={t('fields.moduleKey')}>
          <Input id={`${uid}-module`} value={d.moduleKey} onChange={set('moduleKey')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id={`${uid}-position`} label={t('fields.position')}>
            <Input
              id={`${uid}-position`}
              type="number"
              min={1}
              value={d.position}
              onChange={set('position')}
            />
          </Field>
          <Field id={`${uid}-points`} label={t('fields.points')}>
            <Input
              id={`${uid}-points`}
              type="number"
              min={0}
              value={d.points}
              onChange={set('points')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-[4rem_1fr] gap-3">
          <Field id={`${uid}-emoji`} label={t('fields.badgeEmoji')}>
            <Input
              id={`${uid}-emoji`}
              value={d.badgeEmoji}
              onChange={set('badgeEmoji')}
              placeholder="🧠"
            />
          </Field>
          <Field id={`${uid}-badge`} label={t('fields.badgeLabel')}>
            <Input
              id={`${uid}-badge`}
              value={d.badgeLabel}
              onChange={set('badgeLabel')}
              placeholder="Mente Dropshipper"
            />
          </Field>
        </div>
        <Field id={`${uid}-badgekey`} label={t('fields.badgeKey')}>
          <Input
            id={`${uid}-badgekey`}
            value={d.badgeKey}
            onChange={set('badgeKey')}
            placeholder="mente-dropshipper"
          />
        </Field>
        <Field id={`${uid}-lesson`} label={t('fields.lessonId')}>
          <Input
            id={`${uid}-lesson`}
            value={d.lessonId}
            onChange={set('lessonId')}
            className="font-mono text-xs"
          />
        </Field>
        <Field id={`${uid}-quiz`} label={t('fields.quizId')}>
          <Input
            id={`${uid}-quiz`}
            value={d.quizId}
            onChange={set('quizId')}
            className="font-mono text-xs"
          />
        </Field>
        <Field id={`${uid}-status`} label={t('fields.status')}>
          <select
            id={`${uid}-status`}
            value={d.status}
            onChange={set('status')}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          >
            <option value="DRAFT">{t('status.DRAFT')}</option>
            <option value="PUBLISHED">{t('status.PUBLISHED')}</option>
          </select>
        </Field>
      </div>
      <Field id={`${uid}-description`} label={t('fields.description')}>
        <Textarea
          id={`${uid}-description`}
          value={d.description}
          onChange={set('description')}
          rows={2}
        />
      </Field>
      <Field id={`${uid}-completion`} label={t('fields.completionMessage')}>
        <Textarea
          id={`${uid}-completion`}
          value={d.completionMessage}
          onChange={set('completionMessage')}
          rows={2}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={pending || !d.key.trim() || !d.title.trim()}
        >
          {pending ? pendingLabel : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help ? <p className="text-xs text-text-muted">{help}</p> : null}
    </div>
  );
}
