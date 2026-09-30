'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Tarjeta de conexión directa con GoHighLevel (Administración → Conexión GHL).
 * Consume el controlador dedicado `/api/v1/admin/tenant-settings/ghl`.
 *
 * Sustituye el salto por n8n: aquí se guarda el token con el que Academy llama a
 * GHL directamente (hoy: aplicar etiquetas al completar retos). El `locationId`
 * identifica la sub-cuenta contra la que se verifica el token.
 *
 * Decisiones (espejo de la card SMTP):
 *  - `token` es required sólo cuando NO hay token guardado. Si ya existe, vacío
 *    conserva el guardado (el backend hace merge).
 *  - "Probar conexión" se habilita sólo con `hasTenantConfig` — sin token el
 *    backend rechaza con 400 antes de llamar a GHL.
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
import { adminGhlApi, deriveGhlStatus, type AdminGhlDto } from '@/lib/admin-ghl';
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
  const [dto, setDto] = useState<AdminGhlDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [locationId, setLocationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get();
        if (cancelled) return;
        setDto(data);
        setLocationId(data.locationId ?? '');
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('loadError'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setToast(null);
    if (!dto?.hasToken && !token.trim()) {
      setToast({ variant: 'error', message: t('tokenRequired') });
      return;
    }
    if (!locationId.trim()) {
      setToast({ variant: 'error', message: t('locationRequired') });
      return;
    }
    setSaving(true);
    try {
      const updated = await api.upsert({
        locationId: locationId.trim(),
        ...(token.trim() ? { token: token.trim() } : {}),
      });
      setDto(updated);
      setToken('');
      setToast({ variant: 'success', message: t('saved') });
    } catch (err) {
      setToast({
        variant: 'error',
        message: err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('saveError'),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true);
    setToast(null);
    try {
      const result = await api.test();
      setDto((prev) =>
        prev ? { ...prev, verifiedAt: result.verifiedAt, locationName: result.locationName } : prev,
      );
      setToast({
        variant: 'success',
        message: result.locationName
          ? t('testOk', { location: result.locationName })
          : t('testOkNoName'),
      });
    } catch (err) {
      setToast({
        variant: 'error',
        message: err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('testError'),
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    try {
      await api.remove();
      const refreshed = await api.get();
      setDto(refreshed);
      setToken('');
      setLocationId(refreshed.locationId ?? '');
      setToast({ variant: 'success', message: t('deleted') });
      setDeleteDialogOpen(false);
    } catch (err) {
      setToast({
        variant: 'error',
        message: err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('deleteError'),
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadError ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700"
          >
            {loadError}
          </div>
        ) : null}

        {dto ? <GhlStatusBanner dto={dto} /> : <StatusBannerSkeleton />}

        <p className="text-sm text-text-muted">{t('help')}</p>

        <form onSubmit={handleSubmit} aria-busy={saving} className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ghl-token">
              {dto?.hasToken ? t('tokenLabelOptional') : t('tokenLabel')}
            </Label>
            <Input
              id="ghl-token"
              required={!dto?.hasToken}
              type="password"
              autoComplete="new-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={dto?.hasToken ? t('tokenUnchangedPlaceholder') : t('tokenPlaceholder')}
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? t('saving') : t('saveButton')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!dto?.hasTenantConfig || testing}
                onClick={() => void handleTest()}
              >
                {testing ? t('testing') : t('testButton')}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={!dto?.hasTenantConfig}
              onClick={() => setDeleteDialogOpen(true)}
              className="text-danger-700 hover:bg-danger-50"
            >
              {t('deleteButton')}
            </Button>
          </div>
        </form>
      </CardContent>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialogTitle')}</DialogTitle>
            <DialogDescription>{t('deleteDialogDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? t('deleting') : t('deleteConfirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function GhlStatusBanner({ dto }: { dto: AdminGhlDto }): React.JSX.Element {
  const t = useTranslations('adminGhl');
  const status = deriveGhlStatus(dto);

  if (status === 'verified') {
    const date = dto.verifiedAt
      ? formatDateTime(dto.verifiedAt, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    return (
      <div
        role="status"
        data-testid="ghl-banner-verified"
        className="flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700"
      >
        <span aria-hidden="true">●</span>
        <span>
          {t.rich('bannerVerified', {
            strong: (chunks) => <strong>{chunks}</strong>,
            date,
            location: dto.locationName ?? dto.locationId ?? '',
          })}
        </span>
      </div>
    );
  }

  if (status === 'configured-unverified') {
    return (
      <div
        role="status"
        data-testid="ghl-banner-unverified"
        className="flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700"
      >
        <span aria-hidden="true">●</span>
        <span>{t.rich('bannerUnverified', { em: (chunks) => <em>{chunks}</em> })}</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-testid="ghl-banner-none"
      className="flex items-center gap-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
    >
      <span aria-hidden="true">●</span>
      <span>{t('bannerNone')}</span>
    </div>
  );
}

function StatusBannerSkeleton(): React.JSX.Element {
  return <div className="h-10 w-full animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />;
}
