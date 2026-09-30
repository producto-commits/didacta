'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Tarjeta de conexiones directas con GoHighLevel (Administración → Conexión GHL).
 * Consume el controlador dedicado `/api/v1/admin/tenant-settings/ghl`.
 *
 * Sustituye el salto por n8n: aquí se guardan los tokens con los que Academy
 * llama a GHL directamente (aplicar etiquetas al completar retos). El tenant
 * puede tener VARIAS conexiones (una por sub-cuenta/location); al completar un
 * reto se enruta por el `ghlLocationId` del contacto.
 *
 * Alta = verificar + guardar en un paso: solo se persisten tokens que funcionan
 * y se guarda el nombre que resuelve GHL.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminGhlApi, type AdminGhlConnection } from '@/lib/admin-ghl';
import { ApiHttpError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { formatDateTime } from '@/lib/i18n/format';

interface ToastState {
  variant: 'success' | 'error';
  message: string;
}

export interface GhlSettingsCardProps {
  /** Inyectable para tests: cliente fake sin tocar fetch. */
  api?: typeof adminGhlApi;
}

export function GhlSettingsCard({ api = adminGhlApi }: GhlSettingsCardProps): React.JSX.Element {
  const t = useTranslations('adminGhl');
  const tErrors = useTranslations('errors');
  const [connections, setConnections] = useState<AdminGhlConnection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [locationId, setLocationId] = useState('');
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toRemove, setToRemove] = useState<AdminGhlConnection | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.list();
        if (!cancelled) setConnections(data.connections);
      } catch (err) {
        if (!cancelled)
          setLoadError(
            err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('loadError'),
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(e: FormEvent): Promise<void> {
    e.preventDefault();
    setToast(null);
    if (!token.trim()) {
      setToast({ variant: 'error', message: t('tokenRequired') });
      return;
    }
    if (!locationId.trim()) {
      setToast({ variant: 'error', message: t('locationRequired') });
      return;
    }
    setAdding(true);
    try {
      const res = await api.add({ token: token.trim(), locationId: locationId.trim() });
      setConnections(res.connections);
      setToken('');
      setLocationId('');
      setToast({
        variant: 'success',
        message: res.added.locationName
          ? t('added', { location: res.added.locationName })
          : t('addedNoName'),
      });
    } catch (err) {
      setToast({
        variant: 'error',
        message: err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('addError'),
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(): Promise<void> {
    if (!toRemove) return;
    setRemoving(true);
    try {
      const res = await api.remove(toRemove.locationId);
      setConnections(res.connections);
      setToast({ variant: 'success', message: t('removed') });
      setToRemove(null);
    } catch (err) {
      setToast({
        variant: 'error',
        message: err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('removeError'),
      });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadError ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700"
          >
            {loadError}
          </div>
        ) : null}

        {/* Conexiones existentes */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-text">{t('listTitle')}</p>
          {connections === null ? (
            <div className="h-14 w-full animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />
          ) : connections.length === 0 ? (
            <div
              role="status"
              data-testid="ghl-empty"
              className="rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
            >
              {t('empty')}
            </div>
          ) : (
            <ul className="divide-y divide-border-soft rounded-lg border border-border">
              {connections.map((c) => (
                <li
                  key={c.locationId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-success-600">
                        ●
                      </span>
                      <span className="truncate font-medium text-text">
                        {c.locationName ?? c.locationId}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-subtle">
                      <span className="font-mono">{c.locationId}</span>
                      {c.verifiedAt
                        ? ` · ${t('verifiedAt', {
                            date: formatDateTime(c.verifiedAt, {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            }),
                          })}`
                        : ` · ${t('unverified')}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setToRemove(c)}
                    className="text-danger-700 hover:bg-danger-50"
                  >
                    {t('removeButton')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Alta de una conexión */}
        <form
          onSubmit={handleAdd}
          aria-busy={adding}
          className="grid gap-4 border-t border-border-soft pt-5"
        >
          <div>
            <p className="text-sm font-semibold text-text">{t('addTitle')}</p>
            <p className="mt-1 text-sm text-text-muted">{t('help')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ghl-token">{t('tokenLabel')}</Label>
            <Input
              id="ghl-token"
              required
              type="password"
              autoComplete="new-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t('tokenPlaceholder')}
            />
            <p className="text-xs text-text-subtle">{t('tokenHelp')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ghl-location">{t('locationLabel')}</Label>
            <Input
              id="ghl-location"
              required
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder={t('locationPlaceholder')}
            />
            <p className="text-xs text-text-subtle">{t('locationHelp')}</p>
          </div>

          {toast ? (
            <div
              role="status"
              aria-live="polite"
              className={
                'rounded-md border p-3 text-sm ' +
                (toast.variant === 'success'
                  ? 'border-success-200 bg-success-50 text-success-700'
                  : 'border-danger-100 bg-danger-50 text-danger-700')
              }
              data-testid="ghl-toast"
            >
              {toast.message}
            </div>
          ) : null}

          <div>
            <Button type="submit" disabled={adding}>
              {adding ? t('adding') : t('addButton')}
            </Button>
          </div>
        </form>
      </CardContent>

      <Dialog open={toRemove !== null} onOpenChange={(open) => (!open ? setToRemove(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('removeDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('removeDialogDesc', {
                location: toRemove?.locationName ?? toRemove?.locationId ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setToRemove(null)}
              disabled={removing}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRemove()}
              disabled={removing}
            >
              {removing ? t('removing') : t('removeConfirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
